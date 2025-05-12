// List of patient IDs 001…016
const patients = Array.from({length:16}, (_,i) =>
    String(i+1).padStart(3, '0')
  );
  
  const parseRow = d => ({
    timestamp: d3.isoParse(d['Timestamp (YYYY-MM-DDThh:mm:ss)']),
    glucose:   +d['Glucose Value (mg/dL)']
  });
  
  // Load all CSVs in parallel
  Promise.all(
    patients.map(id =>
      d3.csv(`data/Dexcom_${id}.csv`, parseRow)
        .then(data => ({ id, data }))
    )
  ).then(all => {
    const day = '2020-02-22';
    all.forEach(({ id, data }) => {
      // 1) drop any rows where timestamp parsing failed
      const clean = data.filter(d => d.timestamp != null);
      // 2) then filter to the target day
      const filtered = clean.filter(d => 
        d.timestamp.getUTCFullYear() === 2020 &&
        d3.timeFormat('%Y-%m-%d')(d.timestamp) === day
      );
      renderChart(id, filtered);
    });
  });
  
  function renderChart(id, data) {
    const margin = {top: 10, right: 10, bottom: 20, left: 30};
    const width  = 200 - margin.left - margin.right;
    const height = 120 - margin.top - margin.bottom;
  
    // Create container
    const container = d3.select('#charts')
      .append('div')
        .attr('class','chart');
  
    // Title
    container.append('div')
      .attr('class','chart-title')
      .text(`Patient ${id}`);
  
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
      .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
  
    if (!data.length) {
      svg.append('text')
        .attr('x', width/2).attr('y', height/2)
        .attr('text-anchor','middle')
        .attr('fill','#999')
        .text('no data');
      return;
    }
  
    // Scales
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.timestamp))
      .range([0, width]);
  
    const y = d3.scaleLinear()
      .domain([d3.min(data, d => d.glucose)*0.9, d3.max(data, d => d.glucose)*1.1])
      .nice()
      .range([height, 0]);
  
    // Axes
    const xAxis = d3.axisBottom(x).ticks(3).tickFormat(d3.timeFormat('%H:%M'));
    const yAxis = d3.axisLeft(y).ticks(3);
  
    svg.append('g')
       .attr('transform', `translate(0,${height})`)
       .call(xAxis)
       .selectAll('text')
         .attr('font-size','8px');
  
    svg.append('g')
       .call(yAxis)
       .selectAll('text')
         .attr('font-size','8px');
  
    // Line generator
    const line = d3.line()
      .x(d => x(d.timestamp))
      .y(d => y(d.glucose))
      .curve(d3.curveMonotoneX);
  
    // Path
    svg.append('path')
       .datum(data)
       .attr('fill','none')
       .attr('stroke','steelblue')
       .attr('stroke-width',1.2)
       .attr('d', line);
  
    // Tooltip overlay
    const tooltip = container.append('div')
      .attr('class','tooltip')
      .style('position','absolute')
      .style('pointer-events','none')
      .style('font-size','8px')
      .style('background','#fff')
      .style('padding','2px 4px')
      .style('border','1px solid #aaa')
      .style('border-radius','2px')
      .style('display','none');
  
    // Circles + interactivity
    svg.selectAll('circle')
      .data(data)
      .enter().append('circle')
        .attr('cx', d => x(d.timestamp))
        .attr('cy', d => y(d.glucose))
        .attr('r', 2)
        .attr('fill', 'tomato')
        .on('mouseover', (event, d) => {
          tooltip
            .style('left', (event.pageX+5) + 'px')
            .style('top',  (event.pageY-20) + 'px')
            .style('display', 'block')
            .html(`${d3.timeFormat('%H:%M')(d.timestamp)}<br>${d.glucose} mg/dL`);
        })
        .on('mouseout', () => tooltip.style('display','none'));
  }
  