/**
 * SPECFEM++ Benchmark Plotting with Plotly.js
 * 
 * Fetches benchmark JSON files from the server and creates interactive
 * stacked bar charts showing execution time by region with date range sliders.
 */

// Configuration - adjust this path to match your server setup
const BENCHMARK_BASE_URL = '/home/TROMP/SPECFEMPP-benchmarks/nightly_benchmarks/data/benchmarks';

/**
 * Parse ISO timestamp string to Date object
 */
function parseTimestamp(timestampStr) {
    return new Date(timestampStr.replace('Z', '+00:00'));
}

/**
 * Fetch and parse a JSON file
 */
async function fetchJSON(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.warn(`Failed to fetch ${url}:`, error);
        return null;
    }
}

/**
 * Discover benchmark JSON files (requires server directory listing or manifest)
 * For static hosting, you'll need to provide a manifest.json listing the files
 */
async function discoverBenchmarkFiles() {
    // Option 1: Try to fetch a manifest file that lists all benchmark files
    try {
        const manifest = await fetchJSON('benchmarks_manifest.json');
        if (manifest && manifest.files) {
            return manifest.files;
        }
    } catch (e) {
        console.log('No manifest found, using fallback method');
    }
    
    // Option 2: Hardcoded list or empty array
    // In production, you'd generate benchmarks_manifest.json with your build process
    return [];
}

/**
 * Group benchmark files by benchmark name
 */
function groupFilesByBenchmark(benchmarkData) {
    const groups = {};
    
    for (const data of benchmarkData) {
        if (!data || !data.metadata) continue;
        const name = data.metadata.benchmark_name;
        if (!groups[name]) {
            groups[name] = [];
        }
        groups[name].push(data);
    }
    
    return groups;
}

/**
 * Generate a color for a region (consistent hashing)
 */
function getRegionColor(region, index) {
    const hue = (index * 137.508) % 360; // Golden angle
    return `hsla(${hue}, 70%, 60%, 0.8)`;
}

/**
 * Create Plotly figure from benchmark groups
 */
function createPlotlyFigure(benchmarkGroups) {
    const benchmarkNames = Object.keys(benchmarkGroups);
    const numBenchmarks = benchmarkNames.length;
    
    if (numBenchmarks === 0) {
        return null;
    }
    
    // Responsive layout: 1 column on mobile (<768px), 2 columns on desktop
    const isMobile = window.innerWidth < 768;
    const cols = isMobile ? 1 : 2;
    const rows = Math.ceil(numBenchmarks / cols);
    
    // Collect all unique regions for consistent coloring
    const allRegions = new Set();
    for (const files of Object.values(benchmarkGroups)) {
        for (const data of files) {
            if (data.regions) {
                data.regions.forEach(r => allRegions.add(r.region));
            }
        }
    }
    const regionList = Array.from(allRegions).sort();
    const colorMap = {};
    regionList.forEach((region, idx) => {
        colorMap[region] = getRegionColor(region, idx);
    });
    
    // Create traces
    const traces = [];
    const annotations = [];
    
    benchmarkNames.forEach((benchmarkName, idx) => {
        const files = benchmarkGroups[benchmarkName];
        
        // Collect and sort data by date
        const dataPoints = files.map(data => ({
            date: parseTimestamp(data.metadata.timestamp),
            total: data.metadata.total_execution_time || 0,
            regions: data.regions || []
        })).sort((a, b) => a.date - b.date);
        
        const dates = dataPoints.map(d => d.date.toISOString().split('T')[0]);
        const totals = dataPoints.map(d => d.total);
        
        // Build region data
        const regionData = {};
        regionList.forEach(region => {
            regionData[region] = new Array(dates.length).fill(0);
        });
        
        dataPoints.forEach((dp, dateIdx) => {
            dp.regions.forEach(r => {
                if (regionData[r.region] !== undefined) {
                    regionData[r.region][dateIdx] = r.time;
                }
            });
        });
        
        // Subplot position (1-indexed)
        const row = Math.floor(idx / cols) + 1;
        const col = (idx % cols) + 1;
        const xaxis = idx === 0 ? 'x' : `x${idx + 1}`;
        const yaxis = idx === 0 ? 'y' : `y${idx + 1}`;
        
        // Add trace for each region
        regionList.forEach((region, regionIdx) => {
            traces.push({
                x: dates,
                y: regionData[region],
                name: region,
                type: 'bar',
                marker: { color: colorMap[region] },
                legendgroup: region,
                showlegend: idx === 0, // Only show legend for first subplot
                hovertemplate: '%{x}<br>%{y:.2f}s<br>' + region + '<extra></extra>',
                xaxis: xaxis,
                yaxis: yaxis
            });
        });
        
        // Add annotations for total times (tagged for conditional display)
        dates.forEach((date, i) => {
            annotations.push({
                x: date,
                y: totals[i],
                text: `${totals[i].toFixed(1)}s`,
                showarrow: false,
                yshift: 10,
                xref: xaxis,
                yref: yaxis,
                font: { size: 10, color: 'black' },
                // Tag to identify these as time labels
                _isTimeLabel: true,
                _subplotIdx: idx
            });
        });
    });
    
    // Add subplot titles as annotations BEFORE filtering
    benchmarkNames.forEach((benchmarkName, idx) => {
        annotations.push({
            text: benchmarkName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            xref: idx === 0 ? 'x domain' : `x${idx + 1} domain`,
            yref: idx === 0 ? 'y domain' : `y${idx + 1} domain`,
            x: 0.5,
            y: 1.1,
            xanchor: 'center',
            yanchor: 'bottom',
            showarrow: false,
            font: { size: 14, weight: 'bold' },
            _isSubplotTitle: true
        });
    });
    
    // Calculate initial date range in days
    const allDates = [];
    for (const files of Object.values(benchmarkGroups)) {
        files.forEach(data => {
            allDates.push(parseTimestamp(data.metadata.timestamp));
        });
    }
    
    let rangeDays = 0;
    if (allDates.length > 0) {
        const minDate = new Date(Math.min(...allDates));
        const maxDate = new Date(Math.max(...allDates));
        rangeDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
        console.log(`Initial date range: ${rangeDays.toFixed(1)} days (${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]})`);
    }
    
    // Only show time labels if initial range is <= 7 days
    const visibleAnnotations = rangeDays <= 7 
        ? annotations 
        : annotations.filter(a => !a._isTimeLabel);
    
    console.log(`Showing ${visibleAnnotations.length} of ${annotations.length} annotations (range: ${rangeDays.toFixed(1)} days, threshold: 7 days)`);
    
    // Calculate responsive height: more space for vertical stacking
    const baseHeight = isMobile ? 500 : 400; // Per subplot
    const totalHeight = baseHeight * rows + 180; // Add margin for legend
    
    // Legend positioning: adjust based on number of rows (closer for stacked mobile view)
    const legendY = isMobile ? -0.15 : -0.45;
    
    // Build layout with subplots
    const layout = {
        barmode: 'stack',
        showlegend: true,
        legend: {
            orientation: 'h',
            yanchor: 'top',
            y: legendY,
            xanchor: 'center',
            x: 0.5
        },
        annotations: visibleAnnotations,
        grid: { 
            rows: rows, 
            columns: cols, 
            pattern: 'independent',
            roworder: 'top to bottom',
            ygap: 0.4  // Vertical spacing between subplots (15%)
        },
        autosize: true,
        height: totalHeight,
        margin: { t: 60, b: 180, l: 60, r: 40 },
        // Store all annotations for dynamic updates
        _allAnnotations: annotations
    };
    
    // Configure each subplot
    benchmarkNames.forEach((benchmarkName, idx) => {
        const row = Math.floor(idx / cols) + 1;
        const col = (idx % cols) + 1;
        const xaxisKey = idx === 0 ? 'xaxis' : `xaxis${idx + 1}`;
        const yaxisKey = idx === 0 ? 'yaxis' : `yaxis${idx + 1}`;
        
        layout[xaxisKey] = {
            type: 'date',
            title: 'Date Range Selector',
            // Show range slider on all subplots
            rangeslider: { visible: true, thickness: 0.05 },
            // Only show range selector on first subplot
            rangeselector: idx === 0 ? {
                buttons: [
                    { count: 7, label: '1w', step: 'day', stepmode: 'backward' },
                    { count: 30, label: '1m', step: 'day', stepmode: 'backward' },
                    { count: 90, label: '3m', step: 'day', stepmode: 'backward' },
                    { step: 'all', label: 'All' }
                ]
            } : undefined,
            // Match the range of the first axis
            matches: idx === 0 ? undefined : 'x'
        };
        
        layout[yaxisKey] = {
            title: 'Time (s)',
            autorange: true,
            fixedrange: false
        };
    });
    
    return { traces, layout };
}

/**
 * Render the benchmark plots
 */
async function renderBenchmarkPlots(containerId = 'benchmark-plots') {
    const container = document.getElementById(containerId);
    
    if (!container) {
        console.error(`Container ${containerId} not found`);
        return;
    }
    
    // Show loading message
    container.innerHTML = '<p class="loading">Loading benchmark data...</p>';
    
    try {
        // Discover and fetch benchmark files
        const files = await discoverBenchmarkFiles();
        
        console.log(`Found ${files.length} benchmark files in manifest`);
        
        if (files.length === 0) {
            container.innerHTML = '<p class="error">No benchmark data available. Please generate <code>benchmarks_manifest.json</code>.</p>';
            return;
        }
        
        // Fetch all benchmark data with progress tracking
        console.log('Fetching benchmark data...');
        const benchmarkData = await Promise.all(
            files.map(file => fetchJSON(file))
        );
        
        const validData = benchmarkData.filter(d => d !== null);
        const failedCount = files.length - validData.length;
        
        console.log(`Successfully loaded ${validData.length} files, ${failedCount} failed`);
        
        if (validData.length === 0) {
            container.innerHTML = '<p class="error">Failed to load benchmark data. Check browser console for details.</p>';
            return;
        }
        
        // Group by benchmark name
        const groups = groupFilesByBenchmark(validData);
        
        console.log(`Grouped into ${Object.keys(groups).length} benchmark types:`, Object.keys(groups));
        
        // Create Plotly figure
        const figure = createPlotlyFigure(groups);
        
        if (!figure) {
            container.innerHTML = '<p class="error">No valid benchmark groups found.</p>';
            return;
        }
        
        // Clear container and render
        container.innerHTML = '';
        
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false
        };
        
        console.log('Rendering plot...');
        Plotly.newPlot(container, figure.traces, figure.layout, config);
        console.log('Plot rendered successfully');
        
        // Add event listener to show/hide labels based on visible date range
        // Determine initial state from current annotations
        const allAnnotations = figure.layout._allAnnotations;
        const currentAnnotations = figure.layout.annotations;
        let lastShouldShowLabels = currentAnnotations.length === allAnnotations.length; // Track state to avoid infinite loops
        
        container.on('plotly_relayout', function(eventData) {
            console.log('Relayout event:', eventData);
            
            // Skip if this is an annotation update event
            if (eventData.annotations && Object.keys(eventData).length === 1) {
                console.log('Skipping annotation update event');
                return;
            }
            
            // Check if this is a zoom/range change event
            const hasRangeChange = Object.keys(eventData).some(k => 
                k.includes('.range') || k.includes('.autorange')
            );
            
            if (!hasRangeChange) {
                console.log('No range change detected');
                return;
            }
            
            // We need to use a setTimeout to ensure the layout has been updated
            setTimeout(() => {
                // Get range from current layout (most reliable after button click)
                const layout = container.layout;
                const xaxis = layout.xaxis || {};
                
                if (!xaxis.range || xaxis.range.length !== 2) {
                    console.log('No valid range found in layout');
                    return;
                }
                
                const range0 = new Date(xaxis.range[0]);
                const range1 = new Date(xaxis.range[1]);
                const rangeDays = (range1 - range0) / (1000 * 60 * 60 * 24);
                // Use 7.1 to account for the time component when using "1w" button
                const shouldShowLabels = rangeDays <= 7.1;
                
                console.log(`Range: ${rangeDays.toFixed(1)} days (exact: ${rangeDays}), shouldShowLabels: ${shouldShowLabels} (${rangeDays} <= 7.1 = ${rangeDays <= 7.1}), lastState: ${lastShouldShowLabels}`);
                
                // Only update if state changed
                if (shouldShowLabels === lastShouldShowLabels) {
                    console.log('No state change needed');
                    return;
                }
                lastShouldShowLabels = shouldShowLabels;
                
                // Update annotations - keep subplot titles, toggle time labels
                const allAnnotations = figure.layout._allAnnotations;
                const newAnnotations = shouldShowLabels 
                    ? allAnnotations 
                    : allAnnotations.filter(a => !a._isTimeLabel);
                
                console.log(`${shouldShowLabels ? 'Showing' : 'Hiding'} time labels (${newAnnotations.length} total annotations)`);
                
                Plotly.relayout(container, { annotations: newAnnotations });
            }, 0); // End of setTimeout
        }); // End of plotly_relayout event handler
        
    } catch (error) {
        console.error('Error rendering benchmarks:', error);
        container.innerHTML = `<p class="error">Error loading benchmarks: ${error.message}<br>Check browser console for details.</p>`;
    }
}

// Auto-render when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderBenchmarkPlots());
} else {
    renderBenchmarkPlots();
}

// Re-render on window resize to handle responsive layout changes
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const container = document.getElementById('benchmark-plots');
        if (container && container.data) {
            console.log('Window resized, re-rendering plots...');
            renderBenchmarkPlots();
        }
    }, 250); // Debounce resize events
});
