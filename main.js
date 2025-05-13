const patients = Array.from({length:16}, (_,i) => String(i+1).padStart(3,'0'));
const parseRow = d => ({
  timestamp: d3.isoParse(d['Timestamp (YYYY-MM-DDThh:mm:ss)']),
  glucose:   +d['Glucose Value (mg/dL)']
});

// First load demographics data to get gender information
d3.csv('data/Demographics.csv').then(demographics => {
  // Create a map of patient IDs to gender
  const patientGenders = new Map();
  demographics.forEach(d => {
    // Convert ID to zero-padded string
    const id = String(d.ID).padStart(3, '0');
    patientGenders.set(id, d.Gender);
  });
  
  // Now load the glucose data
Promise.all(
  patients.map(id =>
    d3.csv(`data/Dexcom_${id}.csv`, parseRow)
        .then(data => ({ 
          id, 
          data: data.filter(d => d.timestamp),
          gender: patientGenders.get(id) || 'UNKNOWN'
        }))
  )
).then(all => {
    // For each patient, get all unique days
  all.forEach(p => {
    if (p.data.length === 0) return;
      
      // Get all unique days for this patient
      const uniqueDays = [...new Set(
        p.data.map(d => d3.timeFormat('%Y-%m-%d')(d.timestamp))
      )].sort();
      
      // Get the 5th day (index 4) or last day if fewer than 5 days
      const targetDay = uniqueDays.length >= 5 ? uniqueDays[4] : uniqueDays[uniqueDays.length - 1];
      
      // Filter data for the target day
    p.values = p.data.filter(d => 
        d3.timeFormat('%Y-%m-%d')(d.timestamp) === targetDay
      );
      
      // Normalize all timestamps to a single reference day
      const referenceDate = new Date(2023, 0, 1); // Jan 1, 2023 as reference
      p.values = p.values.map(d => {
        const normalizedTimestamp = new Date(referenceDate);
        normalizedTimestamp.setHours(d.timestamp.getHours());
        normalizedTimestamp.setMinutes(d.timestamp.getMinutes());
        normalizedTimestamp.setSeconds(d.timestamp.getSeconds());
        return {
          originalTimestamp: d.timestamp,
          timestamp: normalizedTimestamp,
          glucose: d.glucose
        };
      });
  });

  // Remove patients with no data
  const withData = all.filter(p => p.values && p.values.length);
    
    // Track selected patients (none selected by default means show all)
    const selectedPatients = new Set();
    
    // Track gender filter state
    const genderFilter = {
      male: true,
      female: true
    };

  // Set up SVG dimensions
    const margin = { top: 60, right: 180, bottom: 0, left: 60 };
    const width  = 1000 - margin.left - margin.right;
    const height = 600 - margin.top  - margin.bottom + 60;

  const svg = d3.select('#chart')
    .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top  + margin.bottom + 60)
    .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add tooltip div
    const tooltip = d3.select('#chart')
      .append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('display', 'none')
      .style('background-color', 'white')
      .style('border', '1px solid #ddd')
      .style('border-radius', '3px')
      .style('padding', '8px')
      .style('pointer-events', 'none')
      .style('font-size', '12px')
      .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)');

    // Add a vertical line for hover
    const verticalLine = svg.append('line')
      .attr('class', 'hover-line')
      .style('stroke', '#999')
      .style('stroke-width', 1)
      .style('stroke-dasharray', '5,5')
      .style('display', 'none')
      .attr('y1', 0)
      .attr('y2', height);
      
    // Add a hover dot
    const hoverDot = svg.append('circle')
      .attr('class', 'hover-dot')
      .attr('r', 4)
      .style('fill', 'white')
      .style('stroke-width', 2)
      .style('display', 'none');

    // x‐scale over the union of all timestamps (normalized to a single day)
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
        
    // X axis label
    svg.append('text')
        .attr('class', 'x-axis-label')
        .attr('text-anchor', 'middle')
        .attr('x', width / 2)
        .attr('y', height + margin.bottom - 50)
        .style('font-size', '12px')
        .text('Time of Day');
        
    // Y axis label
    svg.append('text')
        .attr('class', 'y-axis-label')
        .attr('text-anchor', 'middle')
        .attr('transform', `translate(${-margin.left + 25},${height/2}) rotate(-90)`)
        .style('font-size', '12px')
        .text('Glucose Level (mg/dL)');

  // line generator
  const line = d3.line()
    .x(d => x(d.timestamp))
    .y(d => y(d.glucose))
    .curve(d3.curveMonotoneX);

  // draw one path per patient
  const patientLines = svg.selectAll('.patient-line')
    .data(withData)
    .enter().append('g')
        .attr('class','patient-line')
        .attr('data-gender', p => p.gender);

  patientLines.append('path')
      .attr('fill','none')
      .attr('stroke', p => color(p.id))
      .attr('stroke-width', 1.5)
        .attr('d', p => line(p.values))
        .attr('class', p => `line-${p.id}`);

    // Create invisible overlay for mouse tracking
    const mouseArea = svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mousemove', handleMouseMove)
      .on('mouseout', handleMouseOut);
      
    // Function to handle mouse movement
    function handleMouseMove(event) {
      // Get mouse x position
      const mouseX = d3.pointer(event)[0];
      const mouseY = d3.pointer(event)[1];
      
      // Convert x position to date
      const hoverDate = x.invert(mouseX);
      
      // Find closest data points for each patient
      const closestPoints = [];
  withData.forEach(p => {
        // Skip if filtered by gender
        if ((p.gender === 'MALE' && !genderFilter.male) || 
            (p.gender === 'FEMALE' && !genderFilter.female)) {
          return;
        }
        
        if (p.values.length === 0) return;
        
        // Find closest point
        let closestPoint = null;
        let minDistance = Infinity;
        
        p.values.forEach(d => {
          const distance = Math.abs(d.timestamp - hoverDate);
          if (distance < minDistance) {
            minDistance = distance;
            closestPoint = d;
          }
        });
        
        if (closestPoint) {
          closestPoints.push({
            id: p.id,
            point: closestPoint,
            x: x(closestPoint.timestamp),
            y: y(closestPoint.glucose)
          });
        }
      });
      
      // Find the closest point to the mouse position
      let closestToMouse = null;
      let minDistance = Infinity;
      
      closestPoints.forEach(p => {
        // Only consider visible lines
        const isVisible = selectedPatients.size === 0 || selectedPatients.has(p.id);
        if (!isVisible) return;
        
        const distance = Math.sqrt(
          Math.pow(mouseX - p.x, 2) + 
          Math.pow(mouseY - p.y, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestToMouse = p;
        }
      });
      
      // Only show if we're close enough to a line (within 50px)
      if (closestToMouse && minDistance < 50) {
        // Show and position vertical line
        verticalLine
          .style('display', 'block')
          .attr('x1', closestToMouse.x)
          .attr('x2', closestToMouse.x);
        
        // Show and position dot
        hoverDot
          .style('display', 'block')
          .style('stroke', color(closestToMouse.id))
          .attr('cx', closestToMouse.x)
          .attr('cy', closestToMouse.y);
        
        // Show and position tooltip
          tooltip
          .style('display', 'block')
          .style('left', (event.pageX + 15) + 'px')
          .style('top', (event.pageY - 30) + 'px')
          .html(`
            <strong>Patient ${closestToMouse.id}</strong><br>
            Time: ${d3.timeFormat('%H:%M')(closestToMouse.point.timestamp)}<br>
            Glucose: ${closestToMouse.point.glucose} mg/dL<br>
            Gender: ${withData.find(p => p.id === closestToMouse.id).gender}
          `);
      } else {
        // Hide elements if not close to any line
        verticalLine.style('display', 'none');
        hoverDot.style('display', 'none');
        tooltip.style('display', 'none');
      }
    }
    
    // Function to handle mouse out
    function handleMouseOut() {
      // Hide hover elements
      verticalLine.style('display', 'none');
      hoverDot.style('display', 'none');
      tooltip.style('display', 'none');
    }

    // Reset button functionality
    d3.select('#reset-button').on('click', function() {
      // Clear selections
      selectedPatients.clear();
      
      // Remove selected class and background color from all legend items
      d3.selectAll('.legend-item')
        .classed('selected', false)
        .style('background-color', null);
      
      // Reset gender filters
      genderFilter.male = true;
      genderFilter.female = true;
      
      // Update checkbox states
      d3.select('#male-checkbox').property('checked', true);
      d3.select('#female-checkbox').property('checked', true);
      
      // Update visibility
      updateVisibility();
    });
    
    // Function to update line visibility based on selected patients and gender filter
    function updateVisibility() {
      // If no patients are selected, show all (that pass gender filter)
      const showAll = selectedPatients.size === 0;
      
      patientLines.selectAll('path')
        .transition().duration(200)
        .style('opacity', function() {
          const pathData = d3.select(this.parentNode).datum();
          const pathId = pathData.id;
          const gender = pathData.gender;
          
          // Check gender filter
          const passesGenderFilter = 
            (gender === 'MALE' && genderFilter.male) || 
            (gender === 'FEMALE' && genderFilter.female) ||
            (gender === 'UNKNOWN');
            
          if (!passesGenderFilter) {
            return 0; // Hide completely if filtered by gender
          }
          
          // Check selection filter
          return showAll || selectedPatients.has(pathId) ? 1 : 0.1;
        })
        .style('stroke', function() {
          const pathData = d3.select(this.parentNode).datum();
          return color(pathData.id);
        })
        .style('stroke-width', function() {
          const pathData = d3.select(this.parentNode).datum();
          const pathId = pathData.id;
          const gender = pathData.gender;
          
          // Check gender filter
          const passesGenderFilter = 
            (gender === 'MALE' && genderFilter.male) || 
            (gender === 'FEMALE' && genderFilter.female) ||
            (gender === 'UNKNOWN');
            
          if (!passesGenderFilter) {
            return 0; // Hide completely if filtered by gender
          }
          
          // Check selection filter
          return showAll || selectedPatients.has(pathId) ? 1.5 : 0.5;
        });
        
      // Update legend items opacity based on gender filter
      d3.selectAll('.legend-item')
        .style('opacity', function() {
          const itemData = d3.select(this).datum();
          const gender = itemData.gender;
          
          const passesGenderFilter = 
            (gender === 'MALE' && genderFilter.male) || 
            (gender === 'FEMALE' && genderFilter.female) ||
            (gender === 'UNKNOWN');
            
          return passesGenderFilter ? 1 : 0.3;
        })
        .style('pointer-events', function() {
          const itemData = d3.select(this).datum();
          const gender = itemData.gender;
          
          const passesGenderFilter = 
            (gender === 'MALE' && genderFilter.male) || 
            (gender === 'FEMALE' && genderFilter.female) ||
            (gender === 'UNKNOWN');
            
          return passesGenderFilter ? 'auto' : 'none';
        });
        
      // Handle food log annotations
      updateFoodAnnotations();
    }
    
    // Group for food annotations
    const foodAnnotations = svg.append('g')
      .attr('class', 'food-annotations');
    // Group for carb color legend
    const carbLegendGroup = svg.append('g')
      .attr('class', 'carb-legend-group')
      .attr('transform', `translate(${width / 2 - 80},${-60})`)
      .style('display', 'none');

    // Function to update food annotations
    function updateFoodAnnotations() {
      // Remove existing annotations
      foodAnnotations.selectAll('*').remove();
      // Hide carb legend by default
      carbLegendGroup.style('display', 'none');
      
      // Only show food annotations and legend when exactly one patient is selected
      if (selectedPatients.size !== 1) return;
      
      // Get the selected patient ID
      const selectedId = Array.from(selectedPatients)[0];
      const patient = withData.find(p => p.id === selectedId);
      
      if (!patient || !patient.values || patient.values.length === 0) {
        console.error(`No data for patient ${selectedId}`);
        return;
      }
      
      // Get the target day in both YYYY-MM-DD and M/D/YYYY formats
      const originalTimestamp = patient.values[0].originalTimestamp;
      const targetDayYMD = d3.timeFormat('%Y-%m-%d')(originalTimestamp);
      const targetDayMDY = d3.timeFormat('%-m/%-d/%Y')(originalTimestamp);
      
      
      // Load food log for the selected patient
      d3.csv(`data/Food_Log_${selectedId}.csv`).then(foodData => {
        console.log(`Loaded ${foodData.length} food entries for patient ${selectedId}`);
        
        // Normalize the food data - simplify by just replacing slashes with dashes
        const normalizedFoodData = foodData.map(food => {
          // Replace slashes with dashes in date field if it exists
          if (food.date && food.date.includes('/')) {
            food.date = food.date.replace(/\//g, '-');
          }
          
          // Store time field from either 'time' or 'time_of_day'
          food.timeField = food.time || food.time_of_day;
          
          return food;
        });
        
        // Get target day with dashes for consistency
        const targetDay = targetDayYMD.replace(/\//g, '-');
        
        // Filter for the target day
        let dayFoods = normalizedFoodData.filter(d => {
          // Try to match the date - both might have dashes now
          if (!d.date) return false;
          
          // Simple substring matching (to handle cases where format varies but day/month/year are the same)
          const foodDate = d.date.trim();
          return foodDate.includes(targetDay) || targetDay.includes(foodDate);
        });
        
        console.log(`Found ${dayFoods.length} food entries for ${targetDay}`);
        if (dayFoods.length === 0) return; //some patients have foods logged on different days than the experiment
        
        // Group foods by time
        const foodsByTime = {};
        
        dayFoods.forEach(food => {
          // Get the time field, with fallbacks and ensure we're using all possible time field names
          const timeKey = food.timeField || food.time || food.time_of_day;
          
          if (!timeKey) {
            console.warn("Food entry has not time????");
            return;
          }
          
          if (!foodsByTime[timeKey]) {
            foodsByTime[timeKey] = [];
          }
          foodsByTime[timeKey].push(food);
        });
        
        // Compute total carbs for each annotation
        const carbTotals = Object.values(foodsByTime).map(foods => {
          return foods.reduce((sum, food) => sum + (+food.total_carb || 0), 0);
        });
        const minCarb = Math.min(...carbTotals);
        const maxCarb = Math.max(...carbTotals);
        // Use d3.interpolateRdBu but reversed so blue is low, red is high
        const carbColor = d3.scaleLinear()
          .domain([minCarb, maxCarb])
          .range([d3.rgb('#2171b5'), d3.rgb('#de2d26')]);
        
        // Create annotations for each time entry
        Object.entries(foodsByTime).forEach(([time, foods]) => {
          // Parse the time
          let foodTime = new Date(2023, 0, 1); // Same reference date as glucose data
          
          // Handle different time formats
          if (time.includes(':')) {
            // Format: HH:MM:SS or HH:MM
            const timeParts = time.split(':');
            foodTime.setHours(+timeParts[0]);
            foodTime.setMinutes(+timeParts[1]);
            foodTime.setSeconds(timeParts.length > 2 ? +timeParts[2] : 0);
          } else {
            // Format: HH:MM (without colon) or just hour
            let hour = 0;
            let minute = 0;
            
            if (time.length === 4) {
              // Format: HHMM
              hour = +time.substring(0, 2);
              minute = +time.substring(2, 4);
            } else if (time.length <= 2) {
              // Just hour
              hour = +time;
              minute = 0;
            } else {
              console.warn(`Wrong??? time format: ${time}`);
            }
            
            foodTime.setHours(hour);
            foodTime.setMinutes(minute);
            foodTime.setSeconds(0);
          }
          
          // Calculate summed nutrients
          const nutrients = {
            calorie: 0,
            total_carb: 0,
            dietary_fiber: 0,
            sugar: 0,
            protein: 0,
            total_fat: 0
          };
          
          // Sum up nutrients from all foods at this time
          foods.forEach(food => {
            Object.keys(nutrients).forEach(nutrient => {
              if (food[nutrient] && !isNaN(+food[nutrient])) {
                nutrients[nutrient] += +food[nutrient];
              }
            });
          });
          
          // Get color for this annotation based on total_carb
          const bandColor = carbColor(nutrients.total_carb);
          
          const xPos = x(foodTime);
          const bandWidth = 10; // Width of the annotation band
          
          const band = foodAnnotations.append('rect')
            .attr('x', xPos - bandWidth/2)
            .attr('y', 0)
            .attr('width', bandWidth)
            .attr('height', height)
            .attr('fill', bandColor)
            .attr('fill-opacity', 0.3)
            .attr('stroke', color(selectedId))
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3')
            .style('pointer-events', 'all')
            .on('mouseover', function(event) {
              // Create HTML for food list
              let foodListHTML = '';
              foods.forEach(food => {
                const foodName = food.logged_food || food.food || 'Unknown food';
                foodListHTML += `
                  <div style=\"margin-bottom: 5px;\">\n                    <strong>${foodName}</strong>\n                    ${food.amount ? `- ${food.amount} ${food.unit || ''}` : ''}\n                  </div>\n                `;
              });
              
              // Show detailed tooltip
              tooltip
                .style('display', 'block')
                .style('left', (event.pageX + 15) + 'px')
                .style('top', (event.pageY - 30) + 'px')
                .html(`
                  <strong>Food Entries at ${time}</strong><br>
                  ${foodListHTML}
                  <hr style=\"margin: 5px 0\">\n                  <strong>Total Nutrients:</strong><br>
                  Calories: ${Math.round(nutrients.calorie) || 'N/A'}<br>
                  Carbs: ${Math.round(nutrients.total_carb * 10) / 10 || 'N/A'}g<br>
                  Sugar: ${Math.round(nutrients.sugar * 10) / 10 || 'N/A'}g<br>
                  Protein: ${Math.round(nutrients.protein * 10) / 10 || 'N/A'}g<br>
                  Fat: ${Math.round(nutrients.total_fat * 10) / 10 || 'N/A'}g
                `);
                
              // Highlight the band
              d3.select(this)
                .attr('fill', bandColor)
                .attr('fill-opacity', 0.5)
                .attr('stroke-width', 2);
            })
            .on('mouseout', function() {
              // Hide tooltip
              tooltip.style('display', 'none');
              
              // Restore band appearance
              d3.select(this)
                .attr('fill', bandColor)
                .attr('fill-opacity', 0.3)
                .attr('stroke-width', 1);
            });
          
          // Add a small indicator at the top
          foodAnnotations.append('text')
            .attr('x', xPos)
            .attr('y', -5)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', color(selectedId))
            .text(foods.length > 1 ? '🍽️+' : '🍽️');
        });

        // --- Carb color legend ---
        // Only show if more than one annotation (otherwise gradient is not meaningful)
        if (Object.keys(foodsByTime).length > 1) {
          carbLegendGroup.style('display', 'block');
          carbLegendGroup.selectAll('*').remove();
          // Draw gradient bar
          const legendWidth = 160;
          const legendHeight = 12;
          // Create a gradient definition
          const defs = carbLegendGroup.append('defs');
          const gradient = defs.append('linearGradient')
            .attr('id', 'carb-gradient')
            .attr('x1', '0%').attr('y1', '0%')
            .attr('x2', '100%').attr('y2', '0%');
          gradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', d3.rgb('#2171b5'));
          gradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', d3.rgb('#de2d26'));
          // Draw the bar
          carbLegendGroup.append('rect')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', legendWidth)
            .attr('height', legendHeight)
            .attr('fill', 'url(#carb-gradient)');
          // Add labels
          carbLegendGroup.append('text')
            .attr('x', 0)
            .attr('y', legendHeight + 18)
            .attr('text-anchor', 'start')
            .attr('font-size', 13)
            .attr('fill', '#222')
            .text('Lower carbs');
          carbLegendGroup.append('text')
            .attr('x', legendWidth)
            .attr('y', legendHeight + 18)
            .attr('text-anchor', 'end')
            .attr('font-size', 13)
            .attr('fill', '#222')
            .text('Higher carbs');
        }
      })
      .catch(error => {
        console.error(`Error loading food log for patient ${selectedId}:`, error);
      });
    }

  // legend
  const legend = svg.append('g')
        .attr('transform', `translate(${width+10},0)`)
        .attr('class', 'legend');

    // Create foreign object to use HTML for legend items
    const legendFO = legend.append('foreignObject')
        .attr('width', 160)
        .attr('height', height);
        
    const legendDiv = legendFO.append('xhtml:div')
        .style('font-family', 'sans-serif')
        .style('font-size', '10px');
        
    // Add instruction text
    legendDiv.append('div')
        .style('font-weight', 'bold')
        .style('margin-bottom', '10px')
        .style('font-size', '20px')
        .text('Select patients:');
        
    withData.forEach(p => {
      const item = legendDiv.append('div')
        .attr('class', 'legend-item')
        .datum(p) // Store the full patient data
        .style('margin-bottom', '4px')
        .on('click', function() {
          const p = d3.select(this).datum();
          // Toggle selection
          if (selectedPatients.has(p.id)) {
            selectedPatients.delete(p.id);
            d3.select(this).classed('selected', false);
            d3.select(this).style('background-color', null);
          } else {
            selectedPatients.add(p.id);
            d3.select(this).classed('selected', true);
            // Add background tint similar to line color but with lower opacity
            d3.select(this).style('background-color', d3.color(color(p.id)).copy({opacity: 0.2}));
          }
          
          // Update visibility and food annotations
          updateVisibility();
        })
        .on('mouseover', function() {
          // Get the patient data for this legend item
          const p = d3.select(this).datum();
          const hoveredId = p.id;
          
          // Fade all lines
          patientLines.selectAll('path')
            .transition().duration(200)
            .style('opacity', function() {
              // Get the patient ID for this path
              const pathData = d3.select(this.parentNode).datum();
              const pathId = pathData.id;
              const gender = pathData.gender;
              
              // Check gender filter first
              const passesGenderFilter = 
                (gender === 'MALE' && genderFilter.male) || 
                (gender === 'FEMALE' && genderFilter.female) ||
                (gender === 'UNKNOWN');
                
              if (!passesGenderFilter) {
                return 0; // Hide completely if filtered by gender
              }
              
              // If we have selections, keep selected lines visible
              if (selectedPatients.size > 0) {
                if (selectedPatients.has(pathId)) {
                  // Keep selected lines visible
                  if (pathId === hoveredId) {
                    // This is the hovered line and it's selected
                    return 1;
                  } else {
                    // This is a selected line but not the hovered one
                    return 0.5;
                  }
                } else {
                  // Non-selected lines should be faded
                  return 0.1;
                }
              } else {
                // No selections, just highlight the hovered line
                return pathId === hoveredId ? 1 : 0.2;
              }
            })
            .style('stroke', function() {
              // Get the patient ID for this path
              const pathData = d3.select(this.parentNode).datum();
              const pathId = pathData.id;
              
              // If we have selections, keep selected lines with their color
              if (selectedPatients.size > 0) {
                if (selectedPatients.has(pathId)) {
                  return color(pathId);
                } else {
                  return '#ddd';
                }
              } else {
                // No selections, just highlight the hovered line
                return pathId === hoveredId ? color(pathId) : '#ddd';
              }
            })
            .style('stroke-width', function() {
              // Get the patient ID for this path
              const pathData = d3.select(this.parentNode).datum();
              const pathId = pathData.id;
              
              // If we have selections, keep selected lines with normal width
              if (selectedPatients.size > 0) {
                if (selectedPatients.has(pathId)) {
                  return pathId === hoveredId ? 2.5 : 1.5;
                } else {
                  return 0.5;
                }
              } else {
                // No selections, just highlight the hovered line
                return pathId === hoveredId ? 2.5 : 0.5;
              }
            });
             
          // Ensure the hovered line is highlighted
          svg.select(`.line-${hoveredId}`)
            .raise() // Bring to front
            .transition().duration(200)
            .style('opacity', 1)
            .style('stroke', color(hoveredId))
            .style('stroke-width', 2.5);
        })
        .on('mouseout', function() {
          // Restore visibility based on selection
          updateVisibility();
        });
        
      // Add color square
      item.append('span')
        .style('display', 'inline-block')
        .style('width', '12px')
        .style('height', '12px')
        .style('background-color', color(p.id))
        .style('margin-right', '6px');
        
      // Add text with gender indicator
      item.append('span')
        .html(`Patient ${p.id} <small>(${p.gender})</small>`);
    });

    // Gender filter checkboxes
    d3.select('#male-checkbox').on('change', function() {
      genderFilter.male = this.checked;
      updateVisibility();
    });
    
    d3.select('#female-checkbox').on('change', function() {
      genderFilter.female = this.checked;
      updateVisibility();
    });
  });
});