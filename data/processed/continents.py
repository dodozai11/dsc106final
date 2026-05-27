import pandas as pd
import geopandas as gpd

df = pd.read_csv("data/processed/cland_mean.csv")

df['longitude'] = df['longitude'].apply(lambda lon: lon - 360 if lon > 180 else lon)

gdf = gpd.GeoDataFrame(
    df, 
    geometry = gpd.points_from_xy(df.longitude, df.latitude),
    crs = "EPSG:4326" 
)

world = gpd.read_file("https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip")
world = world.rename(columns={'CONTINENT': 'continent'})

join = gpd.sjoin(gdf, world[['geometry', 'continent']], how = 'left', predicate = 'within')
join['continent'] = join['continent'].fillna('Ocean/Coast')

final_df = join[['latitude', 'longitude', 'cLand', 'continent']]
final_df.to_csv('cland_continents.csv', index = False)