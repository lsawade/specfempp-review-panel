/**
 * SPECFEM++ Benchmark Plotting with Plotly.js
 * 
 * Fetches benchmark JSON files from the server and creates interactive
 * stacked bar charts showing execution time by region with date range sliders.
 * 
 * Version: 2.0 - Removed total time labels
 */

/**
 * Parse ISO timestamp string to Date object
 * Treats timestamps without timezone as UTC to avoid local timezone shifts
 */
function parseTimestamp(timestampStr) {
    // If timestamp doesn't have a timezone indicator, treat it as UTC
    if (!timestampStr.includes('Z') && !timestampStr.includes('+') && !timestampStr.includes('-', 10)) {
        timestampStr += 'Z';
    }
    return new Date(timestampStr);
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
async function discoverBenchmarkFiles(manifestFile) {
    // Try to fetch a manifest file that lists all benchmark files
    try {
        console.log(`Attempting to fetch ${manifestFile}...`);
        const manifest = await fetchJSON(manifestFile);
        console.log(`Manifest fetched from ${manifestFile}:`, manifest);
        if (manifest && manifest.files) {
            console.log(`Found ${manifest.files.length} files in manifest`);
            return manifest.files;
        } else {
            console.warn('Manifest exists but has no files array');
        }
    } catch (e) {
        console.error(`Error fetching manifest ${manifestFile}:`, e);
    }
    
    // Return empty array if manifest not found
    console.warn('Returning empty file list');
    return [];
}

/**
 * Group benchmark files by benchmark name with optional prefix
 */
function groupFilesByBenchmark(benchmarkData, prefix = '') {
    const groups = {};
    
    for (const data of benchmarkData) {
        if (!data || !data.metadata) continue;
        const name = prefix + data.metadata.benchmark_name;
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
function createPlotlyFigure(cpuBenchmarkGroups, gpuBenchmarkGroups) {
    const cpuNames = Object.keys(cpuBenchmarkGroups);
    const gpuNames = Object.keys(gpuBenchmarkGroups);
    const numCpuBenchmarks = cpuNames.length;
    const numGpuBenchmarks = gpuNames.length;
    
    if (numCpuBenchmarks === 0 && numGpuBenchmarks === 0) {
        return null;
    }
    
    // Responsive layout: 1 column on mobile (<768px), 2 columns on desktop
    // Desktop: 2x2 grid (top row CPU, bottom row GPU)
    // Mobile: stacked vertically
    const isMobile = window.innerWidth < 768;
    const cols = isMobile ? 1 : 2;
    const rows = isMobile ? (numCpuBenchmarks + numGpuBenchmarks) : 2;
    
    // Combine all benchmark names in order: CPU benchmarks first, then GPU benchmarks
    const allBenchmarkNames = [...cpuNames, ...gpuNames];
    const benchmarkTypes = [...cpuNames.map(() => 'CPU'), ...gpuNames.map(() => 'GPU')];
    const benchmarkGroups = { ...cpuBenchmarkGroups, ...gpuBenchmarkGroups };
    
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
    
    allBenchmarkNames.forEach((benchmarkName, idx) => {
        const files = benchmarkGroups[benchmarkName];
        const benchmarkType = benchmarkTypes[idx];
        
        // Collect and sort data by date
        const dataPoints = files.map(data => ({
            date: parseTimestamp(data.metadata.timestamp),
            total: data.metadata.total_execution_time || 0,
            regions: data.regions || [],
            hardware: data.metadata.hardware || {},
            git_commit: data.metadata.git_commit || null
        })).sort((a, b) => a.date - b.date);
        
        // Group by date and average measurements for the same day
        const dateGroups = {};
        dataPoints.forEach(dp => {
            const dateStr = dp.date.toISOString().split('T')[0];
            if (!dateGroups[dateStr]) {
                dateGroups[dateStr] = [];
            }
            dateGroups[dateStr].push(dp);
        });
        
        // Average measurements for each date
        const dates = Object.keys(dateGroups).sort();
        const totals = dates.map(dateStr => {
            const points = dateGroups[dateStr];
            const avgTotal = points.reduce((sum, p) => sum + p.total, 0) / points.length;
            return avgTotal;
        });
        
        // Build region data with averaging and track individual measurements for hover
        const regionData = {};
        const regionHoverText = {};
        const regionCustomData = {};
        regionList.forEach(region => {
            regionData[region] = new Array(dates.length).fill(0);
            regionHoverText[region] = new Array(dates.length).fill('');
            regionCustomData[region] = new Array(dates.length).fill(null);
        });
        
        dates.forEach((dateStr, dateIdx) => {
            const points = dateGroups[dateStr];
            const regionSums = {};
            const regionCounts = {};
            const regionValues = {};
            const regionTimestamps = {};
            const hardwareInfo = {};
            
            // Sum up region times across all measurements on this date
            points.forEach(dp => {
                const timeStr = dp.date.toISOString().split('T')[1].substring(0, 5); // HH:MM
                dp.regions.forEach(r => {
                    if (!regionSums[r.region]) {
                        regionSums[r.region] = 0;
                        regionCounts[r.region] = 0;
                        regionValues[r.region] = [];
                        regionTimestamps[r.region] = [];
                        hardwareInfo[r.region] = [];
                    }
                    regionSums[r.region] += r.time;
                    regionCounts[r.region]++;
                    regionValues[r.region].push(r.time);
                    regionTimestamps[r.region].push({ 
                        time: timeStr, 
                        value: r.time,
                        hardware: dp.hardware,
                        git_commit: dp.git_commit
                    });
                });
            });
            
            // Calculate averages and build hover text
            Object.keys(regionSums).forEach(region => {
                if (regionData[region] !== undefined) {
                    const avg = regionSums[region] / regionCounts[region];
                    regionData[region][dateIdx] = avg;
                    
                    // Store all git commit hashes for click handling
                    const commitHashes = regionTimestamps[region]
                        .map(m => m.git_commit?.hash)
                        .filter(hash => hash !== undefined && hash !== null);
                    if (commitHashes.length > 0) {
                        // Remove duplicates
                        regionCustomData[region][dateIdx] = [...new Set(commitHashes)];
                    }
                    
                    // Build hover text showing individual measurements if multiple
                    if (regionCounts[region] > 1) {
                        // Sort by timestamp
                        const sortedMeasurements = regionTimestamps[region]
                            .sort((a, b) => a.time.localeCompare(b.time));
                        
                        const measurements = sortedMeasurements
                            .map((m, i) => {
                                const hw = m.hardware;
                                let hwItems = [];
                                if (hw.architecture) hwItems.push(`• Architecture: ${hw.architecture}`);
                                if (hw.cpu_model) hwItems.push(`• CPU: ${hw.cpu_model}`);
                                if (hw.cpu_max_mhz) hwItems.push(`• Max Freq: ${hw.cpu_max_mhz} MHz`);
                                
                                // Add git commit info if available
                                if (m.git_commit && m.git_commit.hash) {
                                    const shortHash = m.git_commit.hash.substring(0, 7);
                                    hwItems.push(`• Commit: ${shortHash}`);
                                    if (m.git_commit.message) {
                                        // Truncate long commit messages
                                        const msg = m.git_commit.message.length > 50 
                                            ? m.git_commit.message.substring(0, 47) + '...' 
                                            : m.git_commit.message;
                                        hwItems.push(`  ${msg}`);
                                    }
                                    hwItems.push(`  <i>(Click bar to view commit)</i>`);
                                }
                                
                                const hwInfo = hwItems.length > 0 ? '<br>' + hwItems.join('<br>') : '';
                                return `<b>${m.time}</b>: ${m.value.toFixed(2)}s${hwInfo}`;
                            })
                            .join('<br><br>');
                        regionHoverText[region][dateIdx] = 
                            `<b>${dateStr}</b><br>` +
                            `<b>${region}</b><br>` +
                            `<b>Average:</b> ${avg.toFixed(2)}s<br>` +
                            `<b>(${regionCounts[region]} measurements)</b><br><br>` +
                            measurements;
                    } else {
                        const hw = regionTimestamps[region][0].hardware;
                        const git = regionTimestamps[region][0].git_commit;
                        let hwItems = [];
                        if (hw.architecture) hwItems.push(`• Architecture: ${hw.architecture}`);
                        if (hw.cpu_model) hwItems.push(`• CPU: ${hw.cpu_model}`);
                        if (hw.cpu_max_mhz) hwItems.push(`• Max Freq: ${hw.cpu_max_mhz} MHz`);
                        
                        // Add git commit info if available
                        if (git && git.hash) {
                            const shortHash = git.hash.substring(0, 7);
                            hwItems.push(`• Commit: ${shortHash}`);
                            if (git.message) {
                                // Truncate long commit messages
                                const msg = git.message.length > 50 
                                    ? git.message.substring(0, 47) + '...' 
                                    : git.message;
                                hwItems.push(`  ${msg}`);
                            }
                            hwItems.push(`  <i>(Click bar to view commit)</i>`);
                        }
                        
                        const hwInfo = hwItems.length > 0 ? '<br>' + hwItems.join('<br>') : '';
                        regionHoverText[region][dateIdx] = 
                            `<b>${dateStr}</b><br>` +
                            `<b>${region}</b><br>` +
                            `<b>Time:</b> ${avg.toFixed(2)}s${hwInfo}`;
                    }
                }
            });
        });
        
        // Subplot position (1-indexed)
        // Desktop: 2x2 layout (CPU benchmarks on row 1, GPU benchmarks on row 2)
        // Mobile: stacked vertically
        let row, col;
        if (isMobile) {
            row = idx + 1;
            col = 1;
        } else {
            // First two benchmarks (CPU) go on row 1, next two (GPU) go on row 2
            row = Math.floor(idx / 2) + 1;
            col = (idx % 2) + 1;
        }
        
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
                text: regionHoverText[region],
                customdata: regionCustomData[region],
                hovertemplate: '%{text}<extra></extra>',
                textposition: 'none',
                xaxis: xaxis,
                yaxis: yaxis
            });
        });
    });
    
    // Add subplot titles as annotations
    allBenchmarkNames.forEach((benchmarkName, idx) => {
        const benchmarkType = benchmarkTypes[idx];
        // Remove CPU_/GPU_ prefix from benchmark name for display
        const displayName = benchmarkName.replace(/^(CPU_|GPU_)/, '');
        const typeLabel = benchmarkType === 'GPU' ? 'GPU (H100)' : benchmarkType;
        const title = `${typeLabel}: ${displayName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
        annotations.push({
            text: title,
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
    
    // Calculate initial date range in days from both CPU and GPU data
    const allDates = [];
    
    // Collect dates from CPU benchmarks
    for (const files of Object.values(cpuBenchmarkGroups)) {
        files.forEach(data => {
            allDates.push(parseTimestamp(data.metadata.timestamp));
        });
    }
    
    // Collect dates from GPU benchmarks
    for (const files of Object.values(gpuBenchmarkGroups)) {
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
        console.log(`  Total dates collected: ${allDates.length} (CPU + GPU)`);
    }
    
    // Calculate responsive height: more space for vertical stacking
    // Desktop needs extra space for range sliders between rows
    const baseHeight = isMobile ? 500 : 450; // Per subplot
    const gapSpace = isMobile ? 0 : 100; // Extra space for gaps between rows on desktop
    const totalHeight = baseHeight * rows + gapSpace + 80; // Reduced bottom space since legend is on top
    
    // Legend positioning: more space on desktop, less on mobile
    const legendY = isMobile ? 1.04 : 1.09;
    
    // Build layout with subplots
    const layout = {
        barmode: 'stack',
        showlegend: true,
        legend: {
            orientation: 'h',
            yanchor: 'bottom',
            y: legendY,
            xanchor: 'center',
            x: 0.5
        },
        hovermode: 'closest',
        hoverlabel: {
            align: 'left',
            namelength: -1
        },
        annotations: annotations,
        grid: { 
            rows: rows, 
            columns: cols, 
            pattern: 'independent',
            roworder: 'top to bottom',
            ygap: isMobile ? 0.5 : 0.45  // Less gap for mobile (15%), more for desktop (45%)
        },
        autosize: false,
        height: totalHeight,
        width: null,  // Let it use container width
        margin: { t: 100, b: 60, l: 60, r: 40 }
    };
    
    // Configure each subplot
    allBenchmarkNames.forEach((benchmarkName, idx) => {
        let row, col;
        if (isMobile) {
            row = idx + 1;
            col = 1;
        } else {
            row = Math.floor(idx / 2) + 1;
            col = (idx % 2) + 1;
        }
        const xaxisKey = idx === 0 ? 'xaxis' : `xaxis${idx + 1}`;
        const yaxisKey = idx === 0 ? 'yaxis' : `yaxis${idx + 1}`;
        
        layout[xaxisKey] = {
            type: 'date',
            title: 'Date Range Selector',
            // Show range slider on all subplots (thinner on mobile)
            rangeslider: { visible: true, thickness: isMobile ? 0.03 : 0.05 },
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
        // Discover and fetch benchmark files for both CPU and GPU
        const cpuFiles = await discoverBenchmarkFiles('benchmarks_manifest_cpu.json');
        const gpuFiles = await discoverBenchmarkFiles('benchmarks_manifest_gpu.json');
        
        console.log(`Found ${cpuFiles.length} CPU benchmark files and ${gpuFiles.length} GPU benchmark files`);
        
        if (cpuFiles.length === 0 && gpuFiles.length === 0) {
            container.innerHTML = '<p class="error">No benchmark data available. Please generate manifest files.</p>';
            return;
        }
        
        // Fetch all benchmark data with progress tracking
        console.log('Fetching benchmark data...');
        const cpuBenchmarkData = await Promise.all(
            cpuFiles.map(file => fetchJSON(file))
        );
        const gpuBenchmarkData = await Promise.all(
            gpuFiles.map(file => fetchJSON(file))
        );
        
        const validCpuData = cpuBenchmarkData.filter(d => d !== null);
        const validGpuData = gpuBenchmarkData.filter(d => d !== null);
        const failedCount = (cpuFiles.length + gpuFiles.length) - (validCpuData.length + validGpuData.length);
        
        console.log(`Successfully loaded ${validCpuData.length} CPU files and ${validGpuData.length} GPU files, ${failedCount} failed`);
        
        if (validCpuData.length === 0 && validGpuData.length === 0) {
            container.innerHTML = '<p class="error">Failed to load benchmark data. Check browser console for details.</p>';
            return;
        }
        
        // Group by benchmark name with CPU/GPU prefix to keep them separate
        const cpuGroups = groupFilesByBenchmark(validCpuData, 'CPU_');
        const gpuGroups = groupFilesByBenchmark(validGpuData, 'GPU_');
        
        console.log(`Grouped into ${Object.keys(cpuGroups).length} CPU benchmark types:`, Object.keys(cpuGroups));
        console.log(`Grouped into ${Object.keys(gpuGroups).length} GPU benchmark types:`, Object.keys(gpuGroups));
        
        // Create Plotly figure
        const figure = createPlotlyFigure(cpuGroups, gpuGroups);
        
        if (!figure) {
            container.innerHTML = '<p class="error">No valid benchmark groups found.</p>';
            return;
        }
        
        // Clear container and set fixed height to prevent squeezing
        container.innerHTML = '';
        container.style.height = `${figure.layout.height}px`;
        
        // Set width to match container width explicitly
        figure.layout.width = container.offsetWidth;
        
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false
        };
        
        console.log('Rendering plot...');
        Plotly.newPlot(container, figure.traces, figure.layout, config);
        console.log('Plot rendered successfully');
        
        // Add click event handler to open GitHub commit URLs
        container.on('plotly_click', function(data) {
            const point = data.points[0];
            if (point.customdata) {
                const commitHashes = Array.isArray(point.customdata) ? point.customdata : [point.customdata];
                commitHashes.forEach(commitHash => {
                    const commitUrl = `https://github.com/PrincetonUniversity/specfem2d_kokkos/commit/${commitHash}`;
                    window.open(commitUrl, '_blank');
                });
            }
        });
        
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

// Handle responsive layout changes
// Only full re-render when crossing mobile/desktop breakpoint (layout change needed)
// Plotly's autosize handles everything else without triggering reloads
let resizeTimeout;
let lastWidth = window.innerWidth;

window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const currentWidth = window.innerWidth;
        const container = document.getElementById('benchmark-plots');
        
        if (!container || !container.data) return;
        
        // Check if we crossed the mobile/desktop breakpoint (768px)
        const wasDesktop = lastWidth >= 768;
        const isDesktop = currentWidth >= 768;
        const crossedBreakpoint = wasDesktop !== isDesktop;
        
        if (crossedBreakpoint) {
            // Need to re-render with different layout (1 col vs 2 col grid)
            console.log(`Layout breakpoint crossed (${wasDesktop ? 'desktop -> mobile' : 'mobile -> desktop'}), re-rendering plots...`);
            lastWidth = currentWidth;
            renderBenchmarkPlots();
        }
        // Otherwise do nothing - Plotly's autosize in config handles it
    }, 250); // Debounce
});
