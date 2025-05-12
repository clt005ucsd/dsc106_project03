const patients = Array.from({length:16}, (_,i) => String(i+1).padStart(3,'0'));
const parseRow = d => ({
  timestamp: d3.isoParse(d['Timestamp (YYYY-MM-DDThh:mm:ss)']),
  glucose:   +d['Glucose Value (mg/dL)']
});

Promise.all(
  patients.map(id =>
    d3.csv(`data/${id}/Dexcom_${id}.csv`, parseRow)
      .then(data => ({ id, data: data.filter(d => d.timestamp) }))
  )
).then(all => {
  // For each patient, pick only the last date of readings
  all.forEach(p => {
    if (p.data.length === 0) return;
    const maxTs = d3.max(p.data, d => d.timestamp);
    const lastDay = d3.timeFormat('%Y-%m-%d')(maxTs);
    p.values = p.data.filter(d => 
      d3.timeFormat('%Y-%m-%d')(d.timestamp) === lastDay
    );
  });

  // Remove patients with no data
  const withData = all.filter(p => p.values && p.values.length);

  // Set up SVG dimensions
  const margin = { top: 20, right: 150, bottom: 30, left: 40 };
  const width  = 800 - margin.left - margin.right;
  const height = 400 - margin.top  - margin.bottom;

  const svg = d3.select('#chart')
    .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top  + margin.bottom)
    .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

  // x‐scale over the union of all timestamps
  const x = d3.scaleTime()
    .domain(d3.extent(
      d3.merge(withData.map(p => p.values.map(d => d.timestamp)))
    ))
    .range([0, width]);

  // y‐scale over union of all glucose
  const y = d3.scaleLinear()
    .domain([
      d3.min(withData, p => d3.min(p.values, d => d.glucose)) * 0.9,
      d3.max(withData, p => d3.max(p.values, d => d.glucose)) * 1.1
    ])
    .nice()
    .range([height, 0]);

  // color scale
  const color = d3.scaleOrdinal()
    .domain(withData.map(p => p.id))
    .range(d3.schemeCategory10);

  // axes
  svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d3.timeFormat('%H:%M')));

  svg.append('g')
      .call(d3.axisLeft(y));

  // line generator
  const line = d3.line()
    .x(d => x(d.timestamp))
    .y(d => y(d.glucose))
    .curve(d3.curveMonotoneX);

  // draw one path per patient
  const patientLines = svg.selectAll('.patient-line')
    .data(withData)
    .enter().append('g')
      .attr('class','patient-line');

  patientLines.append('path')
      .attr('fill','none')
      .attr('stroke', p => color(p.id))
      .attr('stroke-width', 1.5)
      .attr('d', p => line(p.values));

  // tooltip
  const tooltip = d3.select('#chart')
    .append('div')
      .attr('class','tooltip')
      .style('position','absolute')
      .style('display','none')
      .style('pointer-events','none')
      .style('background','#fff')
      .style('border','1px solid #aaa')
      .style('padding','4px')
      .style('font-size','10px');

  // add circles for hover
  withData.forEach(p => {
    svg.append('g')
      .selectAll('circle')
      .data(p.values)
      .enter().append('circle')
        .attr('cx', d => x(d.timestamp))
        .attr('cy', d => y(d.glucose))
        .attr('r', 2)
        .attr('fill', color(p.id))
        .on('mouseover', (event,d) => {
          tooltip
            .style('left', (event.pageX+5)+'px')
            .style('top',  (event.pageY-25)+'px')
            .style('display','block')
            .html(`Patient ${p.id}<br>
                   ${d3.timeFormat('%H:%M')(d.timestamp)}<br>
                   ${d.glucose} mg/dL`);
        })
        .on('mouseout', () => tooltip.style('display','none'));
  });

  // legend
  const legend = svg.append('g')
      .attr('transform', `translate(${width+10},0)`);

  legend.selectAll('rect')
    .data(withData)
    .enter().append('rect')
      .attr('x', 0).attr('y', (_,i)=> i*18)
      .attr('width', 12).attr('height', 12)
      .attr('fill', p => color(p.id));

  legend.selectAll('text')
    .data(withData)
    .enter().append('text')
      .attr('x', 16).attr('y', (_,i)=> i*18+9)
      .text(p => `Patient ${p.id}`)
      .attr('font-size','10px');
});