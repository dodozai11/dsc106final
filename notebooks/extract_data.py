"""
Extract CMIP6 variables: tas (temperature) and fgco2 (ocean CO2 flux).
Uses zarr_format=2 to work with zarr 3.x against CMIP6 zarr-v2 stores.

Outputs:
  data/processed/tas_timeseries.csv   — global mean near-surface temperature (°C)
  data/processed/fgco2_timeseries.csv — global mean ocean CO2 flux (g m-2 yr-1)
"""

import pandas as pd
import xarray as xr
import gcsfs
import numpy as np

fs = gcsfs.GCSFileSystem(token="anon")

def open_zarr(zstore):
    return xr.open_zarr(
        fs.get_mapper(zstore),
        consolidated=True,
        zarr_format=2
    )

def weighted_spatial_mean(da):
    """Cosine-latitude weighted global mean. Handles lat or latitude coord name."""
    lat_name = "lat" if "lat" in da.coords else "latitude"
    lon_name = "lon" if "lon" in da.coords else "longitude"
    w = np.cos(np.deg2rad(da[lat_name]))
    w.name = "weights"
    return da.weighted(w).mean((lat_name, lon_name))

def to_annual_df(da, value_col):
    yearly = da.groupby("time.year").mean("time")
    return yearly.to_dataframe(name=value_col).reset_index()[["year", value_col]]

# ── Hardcoded store paths (from catalog lookup) ────────────────────────────────
TAS_STORES = {
    "historical": "gs://cmip6/CMIP6/CMIP/NOAA-GFDL/GFDL-CM4/historical/r1i1p1f1/Amon/tas/gr1/v20180701/",
    "ssp245":     "gs://cmip6/CMIP6/ScenarioMIP/NOAA-GFDL/GFDL-CM4/ssp245/r1i1p1f1/Amon/tas/gr1/v20180701/",
    "ssp585":     "gs://cmip6/CMIP6/ScenarioMIP/NOAA-GFDL/GFDL-CM4/ssp585/r1i1p1f1/Amon/tas/gr1/v20180701/",
}

# GFDL-ESM4: esm-hist covers 1850-2014 (same period as CMIP historical)
FGCO2_STORES = {
    "historical": "gs://cmip6/CMIP6/CMIP/NOAA-GFDL/GFDL-ESM4/esm-hist/r1i1p1f1/Omon/fgco2/gr/v20180701/",
    "ssp245":     "gs://cmip6/CMIP6/ScenarioMIP/NOAA-GFDL/GFDL-ESM4/ssp245/r1i1p1f1/Omon/fgco2/gr/v20180701/",
    "ssp585":     "gs://cmip6/CMIP6/ScenarioMIP/NOAA-GFDL/GFDL-ESM4/ssp585/r1i1p1f1/Omon/fgco2/gr/v20180701/",
}

# ── 1. tas ─────────────────────────────────────────────────────────────────────
print("=== Extracting tas (temperature) ===", flush=True)
tas_frames = []

for scenario, zstore in TAS_STORES.items():
    print(f"  {scenario}...", flush=True)
    ds = open_zarr(zstore)
    gm = weighted_spatial_mean(ds["tas"])
    df = to_annual_df(gm, "tas")
    df["scenario"] = scenario
    df["tas"] -= 273.15  # K → °C
    tas_frames.append(df)
    print(f"    {df['year'].min()}–{df['year'].max()}, {len(df)} rows, "
          f"mean={df['tas'].mean():.2f}°C", flush=True)

tas_out = pd.concat(tas_frames, ignore_index=True)
tas_out.to_csv("../data/processed/tas_timeseries.csv", index=False)
print(f"Saved tas_timeseries.csv ({len(tas_out)} rows)\n", flush=True)

# ── 2. fgco2 ──────────────────────────────────────────────────────────────────
print("=== Extracting fgco2 (ocean CO2 flux) ===", flush=True)
fgco2_frames = []

for scenario, zstore in FGCO2_STORES.items():
    print(f"  {scenario}...", flush=True)
    ds = open_zarr(zstore)
    da = ds["fgco2"]
    print(f"    coords: {list(da.coords)}", flush=True)
    gm = weighted_spatial_mean(da)
    df = to_annual_df(gm, "fgco2")
    df["scenario"] = scenario
    df["fgco2"] *= 1000 * 86400 * 365  # kg m-2 s-1 → g m-2 yr-1
    fgco2_frames.append(df)
    print(f"    {df['year'].min()}–{df['year'].max()}, {len(df)} rows, "
          f"mean={df['fgco2'].mean():.4f} g/m²/yr", flush=True)

fgco2_out = pd.concat(fgco2_frames, ignore_index=True)
fgco2_out.to_csv("../data/processed/fgco2_timeseries.csv", index=False)
print(f"Saved fgco2_timeseries.csv ({len(fgco2_out)} rows)\n", flush=True)

print("Done!", flush=True)
