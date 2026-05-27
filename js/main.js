import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

const SCENARIOS = ["historical", "ssp245", "ssp585"];
const COLOR = d3.scaleOrdinal()
  .domain(SCENARIOS)
  .range(["#555555", "#f28e2b", "#e15759"]);

const SCENARIO_LABELS = {
  historical: "Historical",
  ssp245: "SSP2-4.5",
  ssp585: "SSP5-8.5"
};

let activeScenarios = new Set(SCENARIOS);
let scrollYearEnd = null;

Promise.all([
  d3.csv("data/processed/co2_timeseries.csv"),
  d3.csv("data/processed/tas_timeseries.csv"),
  d3.csv("data/processed/fgco2_timeseries.csv"),
  d3.csv("data/processed/cland_continents.csv"),
]).then(([co2Raw, tasRaw, fgco2Raw, clandMapRaw]) => {

  const parse = (rows, valueKey) => rows
    .map(d => ({ year: +d.year, value: +d[valueKey], scenario: d.scenario }))
    .filter(d => Number.isFinite(d.year) && Number.isFinite(d.value) && d.scenario);

  const co2Data   = parse(co2Raw,   "co2mass");
  const tasData   = parse(tasRaw,   "tas");
  const fgco2Data = parse(fgco2Raw, "fgco2");

  const mapData = clandMapRaw.map(d => ({
    latitude:  +d.latitude,
    longitude: +d.longitude,
    cLand:     +d.cLand,
    continent: d.continent
  })).filter(d => d.cLand > 0);

  const continentStats = d3.rollup(
    mapData,
    v => ({
      mean: d3.mean(v, d => d.cLand),
      max: d3.max(v, d => d.cLand)
    }),
    d => d.continent
  );

  const allYears = [...co2Data, ...tasData, ...fgco2Data].map(d => d.year);
  const yearExtent = d3.extent(allYears);

  const getXDomain = () => {
    if (scrollYearEnd !== null) {
      return [yearExtent[0], scrollYearEnd];
    }
    return yearExtent;
  };

  const co2Chart = buildLineChart("#co2-chart", co2Data, "co2mass", "CO₂ Mass (×10¹⁵ kg)", v => (v / 1e15).toFixed(2));

  const otherCharts = [
    buildLineChart("#tas-chart",   tasData,   "tas",   "Temperature (°C)",         v => v.toFixed(2)),
    buildLineChart("#fgco2-chart", fgco2Data, "fgco2", "Ocean Flux (g m⁻² yr⁻¹)", v => v.toFixed(3)),
  ];

  const allCharts = [co2Chart, ...otherCharts];

  buildMap("#carbon-map", mapData, continentStats);

  d3.selectAll(".toggle-btn").on("click", function () {
    const sc = this.dataset.scenario;
    if (activeScenarios.has(sc)) {
      if (activeScenarios.size === 1) return;
      activeScenarios.delete(sc);
      this.classList.remove("active");
    } else {
      activeScenarios.add(sc);
      this.classList.add("active");
    }
    allCharts.forEach(c => c.updateVisibility());
  });

  const scroller = scrollama();
  scroller.setup({
    step: "#scroll-story .step",
    offset: 0.5,
  }).onStepEnter(({ element }) => {
    document.querySelectorAll(".step").forEach(el => el.classList.remove("is-active"));
    element.classList.add("is-active");
    const yearEnd = +element.dataset.yearEnd;
    scrollYearEnd = yearEnd;
    co2Chart.redraw();
  }).onStepExit(({ element, direction }) => {
    if (direction === "up") {
      element.classList.remove("is-active");
    }
  });

  function buildLineChart(selector, data, valueKey, yLabel, fmt) {
    const W = 520, H = 280;
    const M = { top: 20, right: 130, bottom: 40, left: 70 };
    const iW = W - M.left - M.right;
    const iH = H - M.top  - M.bottom;

    const svg = d3.select(selector).append("svg")
      .attr("width",  W)
      .attr("height", H)
      .attr("viewBox", `0 0 ${W} ${H}`)
      .style("overflow", "visible");

    const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);

    const clipId = selector.replace("#", "clip-");
    svg.append("defs").append("clipPath").attr("id", clipId)
      .append("rect").attr("width", iW).attr("height", iH + 2).attr("y", -1);

    const x = d3.scaleLinear().range([0, iW]);
    const yAll = data.map(d => d.value);
    const y = d3.scaleLinear()
      .domain(d3.extent(yAll)).nice()
      .range([iH, 0]);

    const xAxisG = g.append("g").attr("transform", `translate(0,${iH})`);
    const yAxisG = g.append("g");

    g.append("text").attr("class", "axis-label")
      .attr("x", iW / 2).attr("y", iH + 35)
      .attr("text-anchor", "middle").text("Year");

    g.append("text").attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -iH / 2).attr("y", -58)
      .attr("text-anchor", "middle").text(yLabel);

    const lineGen = d3.line().x(d => x(d.year)).y(d => y(d.value));
    const grouped = d3.group(data, d => d.scenario);

    const linesG = g.append("g").attr("clip-path", `url(#${clipId})`);

    const paths = linesG.selectAll(".line")
      .data(SCENARIOS)
      .join("path")
      .attr("class", d => `line sc-${d}`)
      .attr("fill", "none")
      .attr("stroke", d => COLOR(d))
      .attr("stroke-width", 2.5);

    const legend = g.append("g").attr("transform", `translate(${iW + 12}, 10)`);
    SCENARIOS.forEach((sc, i) => {
      const row = legend.append("g").attr("transform", `translate(0,${i * 22})`);
      row.append("line").attr("x2", 18).attr("stroke", COLOR(sc)).attr("stroke-width", 3);
      row.append("text").attr("x", 24).attr("y", 5).attr("class", "legend-label").text(SCENARIO_LABELS[sc]);
    });

    const annotYear = 2025;
    const annotG = g.append("g").attr("class", "annot-now");
    annotG.append("line").attr("stroke", "#aaa").attr("stroke-dasharray", "3,3")
      .attr("y1", 0).attr("y2", iH);
    annotG.append("text").attr("dy", -4).attr("text-anchor", "middle")
      .attr("class", "annot-text").text("2025");

    const crosshairG = g.append("g").attr("class", "crosshair").style("display", "none");
    crosshairG.append("line").attr("class", "crosshair-line")
      .attr("y1", 0).attr("y2", iH)
      .attr("stroke", "#999").attr("stroke-width", 1).attr("stroke-dasharray", "3,2");

    const tooltip = d3.select(selector).append("div").attr("class", "tooltip");

    g.append("rect")
      .attr("width", iW).attr("height", iH)
      .attr("fill", "none").attr("pointer-events", "all")
      .on("mousemove", onMouseMove)
      .on("mouseleave", () => {
        crosshairG.style("display", "none");
        tooltip.style("opacity", 0);
      });

    function onMouseMove(event) {
      const [mx] = d3.pointer(event);
      const year = Math.round(x.invert(mx));
      crosshairG.style("display", null)
        .select("line").attr("x1", x(year)).attr("x2", x(year));

      const lines = [];
      grouped.forEach((vals, sc) => {
        if (!activeScenarios.has(sc)) return;
        const row = vals.find(d => d.year === year);
        if (row) lines.push(`<span style="color:${COLOR(sc)}">${SCENARIO_LABELS[sc]}:</span> ${fmt(row.value)}`);
      });

      tooltip
        .style("opacity", 1)
        .style("left", `${event.offsetX + 16}px`)
        .style("top",  `${event.offsetY - 10}px`)
        .html(`<strong>${year}</strong><br>${lines.join("<br>")}`);
    }

    function redraw() {
      const domain = getXDomain();
      x.domain(domain);
      xAxisG.call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(5));
      yAxisG.call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".2s")));

      SCENARIOS.forEach(sc => {
        const vals = (grouped.get(sc) || [])
          .filter(d => d.year >= domain[0] && d.year <= domain[1])
          .sort((a, b) => a.year - b.year);
        paths.filter(d => d === sc).attr("d", vals.length ? lineGen(vals) : null);
      });

      if (annotYear >= domain[0] && annotYear <= domain[1]) {
        annotG.style("display", null)
          .attr("transform", `translate(${x(annotYear)}, 0)`);
      } else {
        annotG.style("display", "none");
      }
    }

    function updateVisibility() {
      paths.attr("opacity", d => activeScenarios.has(d) ? 1 : 0.08)
           .attr("stroke-width", d => activeScenarios.has(d) ? 2.5 : 1);
      legend.selectAll("text.legend-label")
        .attr("opacity", (d, i) => activeScenarios.has(SCENARIOS[i]) ? 1 : 0.3);
    }

    redraw();
    return { redraw, updateVisibility };
  }

  function buildMap(selector, data, stats) {
    const W = 960, H = 480;

    const svg = d3.select(selector).append("svg")
      .attr("width", W).attr("height", H)
      .attr("viewBox", `0 0 ${W} ${H}`)
      .style("cursor", "grab");

    const projection = d3.geoNaturalEarth1()
      .scale(153)
      .translate([W / 2, H / 2]);

    const colorScale = d3.scaleSequential(d3.interpolateYlGn)
      .domain(d3.extent(data, d => d.cLand));

    const path = d3.geoPath().projection(projection);
    svg.append("path")
      .datum(d3.geoGraticule()())
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#ccc")
      .attr("stroke-width", 0.3);

    svg.append("path")
      .datum({ type: "Sphere" })
      .attr("d", path)
      .attr("fill", "#d6eaf8")
      .attr("stroke", "#aaa")
      .attr("stroke-width", 0.5);

    const dotG = svg.append("g");

    const dots = dotG.selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", d => projection([d.longitude, d.latitude])[0])
      .attr("cy", d => projection([d.longitude, d.latitude])[1])
      .attr("r", 1.6)
      .attr("fill", d => colorScale(d.cLand))
      .attr("opacity", 0.75);

    const mapTip = d3.select("body").append("div").attr("class", "tooltip");

    dots.on("mousemove", function (event, d) {
      d3.select(this).attr("r", 3).attr("opacity", 1);

      const localStat = stats.get(d.continent);

      const statHtml = (localStat && d.continent !== "Ocean/Coast")
        ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #ccc; font-size:0.9em;">
            <strong>${d.continent} Statistics</strong><br>
            Mean: ${localStat.mean.toFixed(3)} kg m⁻²<br>
            Max: ${localStat.max.toFixed(3)} kg m⁻²
            </div>`
        : "";

      const[x, y] = d3.pointer(event, svg.node());

      mapTip.style("opacity", 1)
        .style("left", `${event.pageX + 14}px`)
        .style("top",  `${event.pageY - 10}px`)
        .html(`Lat: ${d.latitude.toFixed(1)}° Lon: ${d.longitude.toFixed(1)}°<br>
               <strong>cLand: ${d.cLand.toFixed(3)} kg m⁻²</strong>
              ${statHtml}`);

    }).on("mouseleave", function () {
      const currentZoom = d3.zoomTransform(svg.node()).k;
      d3.select(this).attr("r", 1.6 / currentZoom).attr("opacity", 0.75);
      mapTip.style("opacity", 0);
    });

    const zoom = d3.zoom()
      .scaleExtent([1, 12])
      .on("zoom", ({ transform }) => {
        dotG.attr("transform", transform);
        dotG.selectAll("circle").attr("r", 1.6 / transform.k).attr("opacity", 0.75);
        svg.style("cursor", "grabbing");
      })
      .on("end", () => svg.style("cursor", "grab"));

    svg.call(zoom);

    const legendW = 160, legendH = 10;
    const legendSvg = d3.select(selector).append("svg")
      .attr("width", legendW + 60).attr("height", 36)
      .style("display", "block").style("margin", "4px auto 0");

    const defs = legendSvg.append("defs");
    const grad = defs.append("linearGradient").attr("id", "map-grad");
    const domain = colorScale.domain();
    [0, 0.25, 0.5, 0.75, 1].forEach(t => {
      grad.append("stop").attr("offset", `${t * 100}%`)
        .attr("stop-color", colorScale(domain[0] + t * (domain[1] - domain[0])));
    });

    legendSvg.append("rect").attr("x", 30).attr("width", legendW).attr("height", legendH)
      .attr("fill", "url(#map-grad)").attr("rx", 2);
    legendSvg.append("text").attr("x", 30).attr("y", 25).attr("class", "legend-label")
      .text(domain[0].toFixed(1));
    legendSvg.append("text").attr("x", 30 + legendW).attr("y", 25)
      .attr("text-anchor", "end").attr("class", "legend-label")
      .text(domain[1].toFixed(1) + " kg m⁻²");
  }

}).catch(err => {
  console.error("Data load error:", err);
  document.body.insertAdjacentHTML("afterbegin",
    `<div class="load-error">⚠️ Could not load one or more data files. Details: ${err.message}</div>`);
});