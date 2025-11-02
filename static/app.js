// GTFS Dashboard - Frontend JavaScript

let map;
let markers = [];
let routePolylines = [];
let currentRouteFilter = 'all';
let stopsData = [];
let routesData = [];
let allStops = [];
let currentStopMarker = null;
let mapViewMode = 'routes'; // 'stops', 'routes', or 'both'
let selectedRoutes = [];
let routePathsLoaded = false; // Track if routes have been loaded

// Create custom marker icon
function createCustomIcon(color = '#7A003C') {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background: ${color};
            width: 30px;
            height: 30px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            position: relative;
        ">
            <div style="
                transform: rotate(45deg);
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(45deg);
                color: white;
                font-size: 12px;
                font-weight: bold;
            ">🚌</div>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30]
    });
}

// Animate number counting
function animateValue(element, start, end, duration) {
    if (start === '-' || end === '-') {
        element.textContent = end;
        return;
    }
    
    const startNum = parseFloat(start) || 0;
    const endNum = parseFloat(end) || 0;
    
    if (startNum === endNum) {
        element.textContent = endNum.toFixed(endNum % 1 !== 0 ? 2 : 0);
        return;
    }
    
    const range = endNum - startNum;
    const increment = range / (duration / 16); // 60fps
    let current = startNum;
    
    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= endNum) || (increment < 0 && current <= endNum)) {
            current = endNum;
            clearInterval(timer);
        }
        element.textContent = current.toFixed(endNum % 1 !== 0 ? 2 : 0);
    }, 16);
}

// Initialize map
function initMap() {
    // Calculate center from stops data if available, otherwise default
    map = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: true
    }).setView([43.6532, -79.3832], 12);
    
    // Add better tile layer with attribution
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        detectRetina: true
    }).addTo(map);
    
    // Add loading overlay
    showMapLoading();
}

// Show loading state on map
function showMapLoading() {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'map-loading';
    loadingOverlay.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 1000;
        background: white;
        padding: 20px 30px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-weight: 600;
        color: #7A003C;
    `;
    loadingOverlay.textContent = 'Loading map...';
    document.getElementById('map').appendChild(loadingOverlay);
}

// Hide loading state
function hideMapLoading() {
    const loading = document.getElementById('map-loading');
    if (loading) {
        loading.style.transition = 'opacity 0.3s';
        loading.style.opacity = '0';
        setTimeout(() => loading.remove(), 300);
    }
}

// Load KPIs with animation
async function loadKPIs() {
    try {
        // Show loading state
        const kpiElements = {
            'kpi-total-stops': document.getElementById('kpi-total-stops'),
            'kpi-total-routes': document.getElementById('kpi-total-routes'),
            'kpi-total-trips': document.getElementById('kpi-total-trips'),
            'kpi-avg-headway': document.getElementById('kpi-avg-headway'),
            'kpi-avg-duration': document.getElementById('kpi-avg-duration')
        };
        
        // Set initial loading state
        Object.values(kpiElements).forEach(el => {
            if (el) {
                const current = el.textContent;
                el.textContent = '...';
                el.style.opacity = '0.5';
            }
        });
        
        const response = await fetch('/api/kpis');
        const kpis = await response.json();
        
        // Animate values
        setTimeout(() => {
            Object.values(kpiElements).forEach(el => {
                if (el) el.style.opacity = '1';
            });
            
            const currentStops = kpiElements['kpi-total-stops'].textContent;
            const currentRoutes = kpiElements['kpi-total-routes'].textContent;
            const currentTrips = kpiElements['kpi-total-trips'].textContent;
            const currentHeadway = kpiElements['kpi-avg-headway'].textContent;
            const currentDuration = kpiElements['kpi-avg-duration'].textContent;
            
            animateValue(kpiElements['kpi-total-stops'], currentStops, kpis.total_stops || '-', 800);
            animateValue(kpiElements['kpi-total-routes'], currentRoutes, kpis.total_routes || '-', 800);
            animateValue(kpiElements['kpi-total-trips'], currentTrips, kpis.total_trips || '-', 800);
            animateValue(kpiElements['kpi-avg-headway'], currentHeadway, kpis.avg_headway_minutes || '-', 800);
            animateValue(kpiElements['kpi-avg-duration'], currentDuration, kpis.avg_trip_duration_minutes || '-', 800);
        }, 100);
        
    } catch (error) {
        console.error('Error loading KPIs:', error);
        // Show error state
        ['kpi-total-stops', 'kpi-total-routes', 'kpi-total-trips', 'kpi-avg-headway', 'kpi-avg-duration']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = 'Error';
            });
    }
}

// Load routes for filter dropdown (home page only)
async function loadRoutesForHome() {
    try {
        console.log('Loading routes for home page filter...');
        const response = await fetch('/api/routes');
        if (!response.ok) {
            throw new Error(`Failed to fetch routes: ${response.status}`);
        }
        routesData = await response.json();
        console.log(`Loaded ${routesData.length} routes for filter`);
        
        const routeFilter = document.getElementById('route-filter');
        const routeSelector = document.getElementById('route-selector');
        
        // Clear existing options (except "All Routes")
        if (routeFilter) {
            while (routeFilter.options.length > 1) {
                routeFilter.remove(1);
            }
        }
        if (routeSelector) {
            while (routeSelector.options.length > 1) {
                routeSelector.remove(1);
            }
            // Ensure 'all' is selected by default
            if (routeSelector.options[0]) {
                routeSelector.options[0].selected = true;
            }
        }
        
        routesData.forEach(route => {
            if (!route.route_id) return; // Skip invalid routes
            
            const option = document.createElement('option');
            option.value = route.route_id;
            const routeNum = route.route_short_name || route.route_id;
            const routeName = route.route_long_name || '';
            option.textContent = `${routeNum}${routeName ? ' - ' + routeName : ''}`;
            if (routeFilter) routeFilter.appendChild(option);
            
            // Add to route selector
            if (routeSelector) {
                const selectorOption = option.cloneNode(true);
                routeSelector.appendChild(selectorOption);
            }
        });
        
        // Initialize selectedRoutes to ['all'] by default
        selectedRoutes = ['all'];
        
        // Add event listeners
        if (routeFilter) {
            routeFilter.removeEventListener('change', handleRouteFilter);
            routeFilter.addEventListener('change', handleRouteFilter);
        }
        
        if (routeSelector) {
            routeSelector.removeEventListener('change', handleRouteSelection);
            routeSelector.addEventListener('change', handleRouteSelection);
        }
        
    } catch (error) {
        console.error('Error loading routes for home page:', error);
    }
}

// Load and display stops on map
async function loadStops() {
    try {
        console.log('Loading stops...');
        hideMapLoading();
        const response = await fetch('/api/stops');
        if (!response.ok) {
            throw new Error(`Failed to fetch stops: ${response.status}`);
        }
        allStops = await response.json();
        stopsData = allStops;
        console.log(`Loaded ${allStops.length} stops`);
        
        updateMapMarkers();
    } catch (error) {
        console.error('Error loading stops:', error);
        hideMapLoading();
        // Show error on map
        const mapDiv = document.getElementById('map');
        if (mapDiv) {
            mapDiv.innerHTML = '<div style="padding: 40px; text-align: center; color: #999;">Error loading stops. Please try refreshing the page.</div>';
        }
    }
}

// Clear route polylines
function clearRoutePolylines() {
    routePolylines.forEach(polyline => map.removeLayer(polyline));
    routePolylines = [];
}

// Generate a color for a route if it doesn't have one
function getRouteColor(route, index) {
    // Try to use route_color from GTFS
    if (route.route_color) {
        // Remove '#' if present and ensure it's a valid hex color
        let color = route.route_color.replace('#', '');
        if (/^[0-9A-Fa-f]{6}$/.test(color)) {
            return '#' + color;
        }
    }
    
    // Generate a distinct color based on route index
    const colors = [
        '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
        '#FF6B00', '#00FF6B', '#6B00FF', '#FF006B', '#00FF6B', '#6BFF00',
        '#FF3366', '#66FF33', '#3366FF', '#FF6633', '#33FF66', '#6633FF',
        '#E74C3C', '#27AE60', '#3498DB', '#F39C12', '#9B59B6', '#1ABC9C',
        '#E67E22', '#34495E', '#16A085', '#D35400', '#C0392B', '#2980B9'
    ];
    
    return colors[index % colors.length];
}

// Load and draw route paths
async function loadRoutePaths() {
    clearRoutePolylines();
    
    // Only load if in routes or both mode
    if (mapViewMode !== 'routes' && mapViewMode !== 'both') {
        console.log(`loadRoutePaths: Skipping - mapViewMode is '${mapViewMode}'`);
        return;
    }
    
    try {
        console.log('Fetching route paths from /api/routes/paths...');
        const response = await fetch('/api/routes/paths');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
        }
        
        const allPaths = await response.json();
        
        if (!allPaths || allPaths.length === 0) {
            console.warn('No route paths returned from API');
            const panelContent = document.getElementById('panel-content');
            if (panelContent) {
                panelContent.innerHTML = '<div class="error-message">No route paths available. Make sure GTFS data is loaded.</div>';
            }
            return;
        }
        
        console.log(`Loading ${allPaths.length} route paths`);
        
        allPaths.forEach((routePath, index) => {
            const route = routePath.route;
            const coordinates = routePath.coordinates;
            
            if (!coordinates || coordinates.length < 2) {
                console.log(`Skipping route ${routePath.route_id} - insufficient coordinates`);
                return;
            }
            
            // Determine if this route should be displayed
            // Show route if:
            // 1. No routes selected (show all by default)
            // 2. 'all' is in selectedRoutes
            // 3. This specific route_id is in selectedRoutes
            const shouldDisplay = 
                (selectedRoutes.length === 0 || 
                 selectedRoutes.includes('all') || 
                 selectedRoutes.includes(routePath.route_id)) &&
                (mapViewMode === 'routes' || mapViewMode === 'both');
            
            if (!shouldDisplay) {
                console.log(`Skipping route ${routePath.route_id} - not in selection`, selectedRoutes);
                return;
            }
            
            console.log(`Displaying route ${routePath.route_id}`);
            
            // Get route color (different color for each route)
            const routeColor = getRouteColor(route, index);
            
            // Convert coordinates format: [lat, lon] is correct for Leaflet
            const latLngs = coordinates.map(coord => {
                // Handle both [lat, lon] and [lon, lat] formats
                if (Array.isArray(coord) && coord.length >= 2) {
                    const lat = parseFloat(coord[0]);
                    const lon = parseFloat(coord[1]);
                    
                    // Validate coordinates
                    if (isNaN(lat) || isNaN(lon)) {
                        console.warn(`Route ${routePath.route_id}: Invalid coordinate ${coord}`);
                        return null;
                    }
                    
                    // Ensure valid lat/lon ranges
                    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                        console.warn(`Route ${routePath.route_id}: Coordinate out of range (${lat}, ${lon})`);
                        return null;
                    }
                    
                    return [lat, lon]; // [lat, lon] for Leaflet
                }
                console.warn(`Route ${routePath.route_id}: Invalid coordinate format`, coord);
                return null;
            }).filter(coord => coord !== null);
            
            if (latLngs.length < 2) {
                console.log(`Skipping route ${routePath.route_id} - only ${latLngs.length} valid coordinates (need at least 2)`);
                return;
            }
            
            console.log(`Route ${routePath.route_id}: ${latLngs.length} coordinates, first: [${latLngs[0][0]}, ${latLngs[0][1]}], last: [${latLngs[latLngs.length-1][0]}, ${latLngs[latLngs.length-1][1]}]`);
            
            // Draw polyline with distinct color and better visibility
            const polyline = L.polyline(latLngs, {
                color: routeColor,
                weight: 6,
                opacity: 0.8,
                smoothFactor: 1,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);
            
            // Add popup with route info
            const routeName = route.route_short_name || route.route_id;
            const routeLongName = route.route_long_name || '';
            polyline.bindPopup(`
                <div style="font-weight: 600; margin-bottom: 8px;">
                    <strong style="color: ${routeColor}; font-size: 1.2em;">Route ${routeName}</strong>
                </div>
                <div style="color: #495965; margin-bottom: 5px;">
                    ${routeLongName || 'No description'}
                </div>
                <div style="font-size: 0.9em; color: #718096;">
                    ${routePath.total_stops} stops on this route
                </div>
            `);
            
            // Add hover effect
            polyline.on('mouseover', function() {
                this.setStyle({
                    weight: 8,
                    opacity: 1.0
                });
            });
            
            polyline.on('mouseout', function() {
                this.setStyle({
                    weight: 6,
                    opacity: 0.8
                });
            });
            
            // Add click handler to show route details in panel
            polyline.on('click', function() {
                showRouteDetailsInPanel(routePath.route_id);
            });
            
            routePolylines.push(polyline);
        });
        
            console.log(`Displayed ${routePolylines.length} route polylines with different colors`);
        
        if (routePolylines.length === 0) {
            console.warn('No route polylines were created. Check coordinate data.');
            const panelContent = document.getElementById('panel-content');
            if (panelContent) {
                panelContent.innerHTML = '<div class="error-message">No routes could be displayed. Check GTFS data.</div>';
            }
        }
        
        // Update details panel after loading routes
        if (mapViewMode === 'routes' || mapViewMode === 'both') {
            updateDetailsPanelForViewMode();
        }
        
        // Fit map to show all routes if needed
        if (routePolylines.length > 0 && mapViewMode === 'routes') {
            const bounds = L.latLngBounds([]);
            routePolylines.forEach(polyline => {
                try {
                bounds.extend(polyline.getBounds());
                } catch (e) {
                    console.error('Error extending bounds:', e);
                }
            });
            if (bounds.isValid()) {
            map.fitBounds(bounds.pad(0.1));
                console.log('Map fitted to show all routes');
            }
        } else if (routePolylines.length > 0 && mapViewMode === 'both') {
            // If showing both, fit to include both stops and routes
            const bounds = L.latLngBounds([]);
            routePolylines.forEach(polyline => {
                try {
                    bounds.extend(polyline.getBounds());
                } catch (e) {
                    console.error('Error extending bounds:', e);
                }
            });
            // Also include stop markers
            if (markers.length > 0) {
                markers.forEach(marker => {
                    try {
                        bounds.extend(marker.getLatLng());
                    } catch (e) {
                        console.error('Error extending bounds with marker:', e);
                    }
                });
            }
            if (bounds.isValid()) {
                map.fitBounds(bounds.pad(0.1));
                console.log('Map fitted to show routes and stops');
            }
        }
        
    } catch (error) {
        console.error('Error loading route paths:', error);
        alert('Error loading routes: ' + error.message);
    }
}

// Update details panel based on current view mode
async function updateDetailsPanelForViewMode() {
    const panel = document.getElementById('details-panel');
    const panelTitle = document.getElementById('panel-title');
    const panelContent = document.getElementById('panel-content');
    
    if (!panel || !panelTitle || !panelContent) return;
    
    panelContent.innerHTML = '<div class="loading">Loading details...</div>';
    panel.style.transform = 'translateX(0)'; // Show panel
    
    if (mapViewMode === 'stops' || mapViewMode === 'both') {
        // Show all stops
        panelTitle.textContent = 'All Stops';
        try {
            let html = '<div class="stops-summary"><h4>📍 All Stops</h4>';
            
            if (stopsData && stopsData.length > 0) {
                html += `<p><strong>Total Stops:</strong> ${stopsData.length}</p>`;
                html += '<div class="stops-list" style="max-height: 400px; overflow-y: auto;">';
                
                stopsData.slice(0, 100).forEach((stop, index) => {
                    html += `
                        <div class="stop-item" style="padding: 10px; border-bottom: 1px solid #e0e0e0; cursor: pointer;" 
                             onclick="showStopDetailsFromPopup('${stop.stop_id}')">
                            <div style="font-weight: 600; color: #7A003C;">${stop.stop_name || stop.stop_id}</div>
                            <div style="font-size: 0.85em; color: #666;">ID: ${stop.stop_id}</div>
                            ${stop.stop_desc ? `<div style="font-size: 0.85em; color: #888;">${stop.stop_desc}</div>` : ''}
                        </div>
                    `;
                });
                
                if (stopsData.length > 100) {
                    html += `<div style="padding: 10px; text-align: center; color: #888;">... and ${stopsData.length - 100} more stops. Click on a marker to see details.</div>`;
                }
                
                html += '</div>';
            } else {
                html += '<p class="placeholder">No stops loaded. Upload a GTFS dataset first.</p>';
            }
            
            html += '</div>';
            panelContent.innerHTML = html;
        } catch (error) {
            console.error('Error loading stops summary:', error);
            panelContent.innerHTML = '<div class="error-message">Error loading stops.</div>';
        }
    } else if (mapViewMode === 'routes') {
        // Show all routes
        panelTitle.textContent = 'All Routes';
        try {
            let html = '<div class="routes-summary"><h4>🛣️ All Routes</h4>';
            
            if (routesData && routesData.length > 0) {
                html += `<p><strong>Total Routes:</strong> ${routesData.length}</p>`;
                html += '<div class="routes-list" style="max-height: 400px; overflow-y: auto;">';
                
                routesData.slice(0, 100).forEach((route) => {
                    const routeColor = route.route_color ? `#${route.route_color}` : '#7A003C';
                    const routeName = route.route_short_name || route.route_id;
                    const routeLongName = route.route_long_name || '';
                    
                    html += `
                        <div class="route-item" style="padding: 10px; border-bottom: 1px solid #e0e0e0; border-left: 4px solid ${routeColor}; cursor: pointer;" 
                             onclick="showRouteDetailsInPanel('${route.route_id}')">
                            <div style="font-weight: 600; color: ${routeColor}; display: flex; align-items: center; gap: 8px;">
                                <span style="background: ${routeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.9em;">${routeName}</span>
                                <span>${routeLongName || route.route_id}</span>
                            </div>
                            <div style="font-size: 0.85em; color: #666; margin-top: 4px;">ID: ${route.route_id}</div>
                        </div>
                    `;
                });
                
                if (routesData.length > 100) {
                    html += `<div style="padding: 10px; text-align: center; color: #888;">... and ${routesData.length - 100} more routes.</div>`;
                }
                
                html += '</div>';
            } else {
                html += '<p class="placeholder">No routes loaded. Upload a GTFS dataset first.</p>';
            }
            
            html += '</div>';
            panelContent.innerHTML = html;
        } catch (error) {
            console.error('Error loading routes summary:', error);
            panelContent.innerHTML = '<div class="error-message">Error loading routes.</div>';
        }
    }
}

// Show route details in panel (when route is clicked)
async function showRouteDetailsInPanel(routeId) {
    const panel = document.getElementById('details-panel');
    const panelTitle = document.getElementById('panel-title');
    const panelContent = document.getElementById('panel-content');
    
    if (!panel || !panelTitle || !panelContent) {
        console.error('Details panel elements not found');
        return;
    }
    
    if (!routeId || routeId === 'undefined' || routeId === '') {
        console.error('Invalid route ID:', routeId);
        panelContent.innerHTML = '<div class="error-message">Invalid route ID.</div>';
        return;
    }
    
    panelContent.innerHTML = '<div class="loading">Loading route details...</div>';
    panel.style.transform = 'translateX(0)';
    
    try {
        console.log(`Loading details for route: ${routeId}`);
        const [detailsResponse, stopsResponse] = await Promise.all([
            fetch(`/api/routes/${encodeURIComponent(routeId)}/details`),
            fetch(`/api/routes/${encodeURIComponent(routeId)}/stops`)
        ]);
        
        if (!detailsResponse.ok) {
            throw new Error(`Failed to fetch route details: ${detailsResponse.status} ${detailsResponse.statusText}`);
        }
        
        if (!stopsResponse.ok) {
            throw new Error(`Failed to fetch route stops: ${stopsResponse.status} ${stopsResponse.statusText}`);
        }
        
        const details = await detailsResponse.json();
        const stops = await stopsResponse.json();
        
        console.log('Route details loaded:', details);
        console.log('Route stops loaded:', stops?.length || 0);
        
        if (!details || details.error) {
            throw new Error(details.error || 'Failed to load route details');
        }
        
        // Validate response data
        if (!details || !details.route) {
            throw new Error('Invalid route details response - route data missing');
        }
        
        if (!stops || !Array.isArray(stops)) {
            console.warn('Stops data is not an array:', stops);
            stops = [];
        }
        
        const route = details.route;
        const routeColor = route.route_color ? `#${route.route_color}` : '#7A003C';
        const routeTextColor = route.route_text_color ? `#${route.route_text_color}` : '#ffffff';
        
        panelTitle.innerHTML = `
            <span style="background: ${routeColor}; color: ${routeTextColor}; padding: 4px 12px; border-radius: 4px; font-size: 0.9em; margin-right: 8px;">
                ${route.route_short_name || route.route_id}
            </span>
            ${route.route_long_name || 'Route Details'}
        `;
        
        let html = `
            <div class="route-info">
                <h4>🛣️ Route Information</h4>
                <div class="info-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                    <div><strong>Route ID:</strong><br>${route.route_id || 'N/A'}</div>
                    <div><strong>Total Trips:</strong><br>${details.total_trips || 0}</div>
                    <div><strong>Total Stops:</strong><br>${details.total_stops || stops.length || 0}</div>
                    ${details.avg_headway_minutes ? `<div><strong>Avg Headway:</strong><br>${details.avg_headway_minutes} min</div>` : ''}
                </div>
                
                <h4 style="margin-top: 20px;">📍 Stops on This Route (${stops.length})</h4>
                <div class="stops-list" style="max-height: 300px; overflow-y: auto;">
        `;
        
        if (stops.length > 0) {
            stops.forEach((stop, index) => {
                html += `
                    <div class="stop-item" style="padding: 8px; border-bottom: 1px solid #e0e0e0; cursor: pointer;" 
                         onclick="showStopDetailsFromPopup('${stop.stop_id}')">
                        <span style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px; margin-right: 8px; font-weight: 600;">${index + 1}</span>
                        <span style="font-weight: 600;">${stop.stop_name || stop.stop_id}</span>
                        <div style="font-size: 0.85em; color: #666; margin-left: 24px;">ID: ${stop.stop_id}</div>
                    </div>
                `;
            });
        } else {
            html += '<div style="padding: 20px; text-align: center; color: #888;">No stops found for this route.</div>';
        }
        
        html += `
                </div>
            </div>
        `;
        
        panelContent.innerHTML = html;
        console.log('Route details displayed successfully');
    } catch (error) {
        console.error('Error loading route details:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        panelContent.innerHTML = `<div class="error-message">Error loading route details: ${errorMessage}</div>`;
    }
}

// Make function globally accessible
window.showRouteDetailsInPanel = showRouteDetailsInPanel;

// Create markers for stops
function updateMapMarkers() {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    // Clear route lines if not showing stops
    if (mapViewMode === 'routes') {
        return;
    }
    
    if (!stopsData || stopsData.length === 0) {
        return;
    }
    
    // Get route colors if available
    const routeColors = {};
    routesData.forEach(route => {
        if (route.route_color) {
            routeColors[route.route_id] = '#' + route.route_color;
        }
    });
    
    // Create markers for each stop
    stopsData.forEach((stop, index) => {
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);
        
        if (isNaN(lat) || isNaN(lon)) return;
        
        // Determine marker color based on current filter
        let markerColor = '#7A003C';
        if (currentRouteFilter !== 'all' && routesData.find(r => r.route_id === currentRouteFilter)) {
            const route = routesData.find(r => r.route_id === currentRouteFilter);
            markerColor = route.route_color ? '#' + route.route_color : '#7A003C';
        }
        
        const icon = createCustomIcon(markerColor);
        
        const marker = L.marker([lat, lon], { icon })
            .addTo(map)
            .bindPopup(
                `<div style="font-weight: 600; margin-bottom: 8px;">
                    <strong style="color: #7A003C; font-size: 1.1em;">${stop.stop_name || stop.stop_id}</strong>
                </div>
                <div style="color: #495965; font-size: 0.9em;">
                    Stop ID: ${stop.stop_id}
                </div>
                <div style="margin-top: 8px;">
                    <button onclick="showStopDetailsFromPopup('${stop.stop_id}')" 
                            style="background: #7A003C; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        View Details
                    </button>
                </div>`,
                {
                    maxWidth: 250,
                    className: 'custom-popup'
                }
            );
        
        // Add click handler with animation
        marker.on('click', function() {
            // Highlight clicked marker
            highlightMarker(marker);
            showStopDetails(stop);
        });
        
        // Add hover effect
        marker.on('mouseover', function() {
            marker.setZIndexOffset(1000);
        });
        
        marker.on('mouseout', function() {
            marker.setZIndexOffset(0);
        });
        
        markers.push(marker);
        
        // Stagger marker appearance
        setTimeout(() => {
            marker.getElement().style.transition = 'transform 0.3s ease';
        }, index * 10);
    });
    
    // Fit map to show all markers with padding (only if showing stops)
    if (markers.length > 0 && (mapViewMode === 'stops' || mapViewMode === 'both')) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.15), {
            maxZoom: 15,
            animate: true,
            duration: 1.0
        });
    }
    
    hideMapLoading();
    
    // Update details panel after loading stops
    if (mapViewMode === 'stops' || mapViewMode === 'both') {
        updateDetailsPanelForViewMode();
    }
}

// Handle map view toggle
function handleMapViewToggle(event) {
    const newMode = event.target.value;
    console.log('Map view mode changing from', mapViewMode, 'to', newMode);
    
    mapViewMode = newMode;
    
    if (mapViewMode === 'routes' || mapViewMode === 'both') {
        // Always reload route paths when switching to routes view
        console.log(`Loading route paths for mode: ${mapViewMode}...`);
        loadRoutePaths().then(() => {
            console.log('Route paths loaded successfully');
        }).catch((error) => {
            console.error('Failed to load route paths:', error);
        });
    } else {
        console.log('Clearing route polylines...');
        clearRoutePolylines();
    }
    
    if (mapViewMode === 'stops' || mapViewMode === 'both') {
        updateMapMarkers();
    } else {
        // Clear markers when showing only routes
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];
    }
    
    // Update details panel based on view mode
    updateDetailsPanelForViewMode();
}

// Handle route selection
function handleRouteSelection(event) {
    const options = Array.from(event.target.selectedOptions);
    selectedRoutes = options.map(opt => opt.value);
    
    console.log('Route selection changed:', selectedRoutes);
    
    // If 'all' is selected, clear other selections and show all routes
    if (selectedRoutes.includes('all')) {
        selectedRoutes = ['all'];
        // Update UI to show only 'all' selected
        const routeSelector = document.getElementById('route-selector');
        if (routeSelector) {
            Array.from(routeSelector.options).forEach(opt => {
                opt.selected = (opt.value === 'all');
            });
        }
    }
    
    // Reload route paths if in routes or both mode
    if (mapViewMode === 'routes' || mapViewMode === 'both') {
        console.log('Reloading route paths with selection:', selectedRoutes);
        loadRoutePaths();
    }
}

// Highlight a marker
function highlightMarker(marker) {
    // Reset previous highlight
    if (currentStopMarker && currentStopMarker !== marker) {
        currentStopMarker.setIcon(createCustomIcon('#7A003C'));
    }
    
    currentStopMarker = marker;
    marker.setIcon(createCustomIcon('#FDBF57'));
    
    // Bounce animation
    const icon = marker.getElement();
    if (icon) {
        icon.style.animation = 'bounce 0.5s ease';
        setTimeout(() => {
            icon.style.animation = '';
        }, 500);
    }
}

// Show stop details from popup button
window.showStopDetailsFromPopup = function(stopId) {
    const stop = allStops.find(s => s.stop_id === stopId);
    if (stop) {
        // Close popup
        map.closePopup();
        showStopDetails(stop);
        
        // Find and highlight marker
        const marker = markers.find(m => {
            const latlng = m.getLatLng();
            const stopLat = parseFloat(stop.stop_lat);
            const stopLon = parseFloat(stop.stop_lon);
            return Math.abs(latlng.lat - stopLat) < 0.0001 && Math.abs(latlng.lng - stopLon) < 0.0001;
        });
        if (marker) {
            highlightMarker(marker);
            map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), {
                animate: true
            });
        }
    }
};

// Handle route filter
async function handleRouteFilter(event) {
    currentRouteFilter = event.target.value;
    
    // Show loading state
    const mapContainer = document.getElementById('map');
    showMapLoading();
    
    // Update button text
    const resetBtn = document.getElementById('reset-view');
    if (resetBtn) {
        resetBtn.textContent = 'Loading...';
        resetBtn.disabled = true;
    }
    
    if (currentRouteFilter === 'all') {
        stopsData = allStops;
        setTimeout(() => {
            updateMapMarkers();
            if (resetBtn) {
                resetBtn.textContent = 'Reset View';
                resetBtn.disabled = false;
            }
        }, 300);
    } else {
        try {
            const response = await fetch(`/api/routes/${currentRouteFilter}/stops`);
            stopsData = await response.json();
            setTimeout(() => {
                updateMapMarkers();
                if (resetBtn) {
                    resetBtn.textContent = 'Reset View';
                    resetBtn.disabled = false;
                }
            }, 300);
        } catch (error) {
            console.error('Error loading route stops:', error);
            if (resetBtn) {
                resetBtn.textContent = 'Reset View';
                resetBtn.disabled = false;
            }
            hideMapLoading();
        }
    }
}

// Show stop details in side panel
async function showStopDetails(stop) {
    const panel = document.getElementById('details-panel');
    const panelTitle = document.getElementById('panel-title');
    const panelContent = document.getElementById('panel-content');
    
    panelTitle.textContent = stop.stop_name || stop.stop_id;
    
    // Show loading with animation
    panelContent.innerHTML = '<div class="loading">Loading departures</div>';
    
    // Animate panel opening
    panel.style.transform = 'translateX(0)';
    
    // Load departures
    try {
        const response = await fetch(`/api/stops/${stop.stop_id}/departures`);
        const departures = await response.json();
        
        let html = `
            <div class="stop-info">
                <h4>📍 Stop Information</h4>
                <p><strong>Stop ID:</strong> ${stop.stop_id}</p>
                <p><strong>Stop Name:</strong> ${stop.stop_name || 'N/A'}</p>
                ${stop.stop_desc ? `<p><strong>Description:</strong> ${stop.stop_desc}</p>` : ''}
                <p><strong>Coordinates:</strong><br>
                   ${parseFloat(stop.stop_lat).toFixed(6)}, ${parseFloat(stop.stop_lon).toFixed(6)}</p>
            </div>
        `;
        
        if (departures.length > 0) {
            html += `
                <div class="departures-list">
                    <h4>Upcoming Departures</h4>
            `;
            
            // Sort by time and limit to next 10
            const sortedDepartures = departures
                .slice(0, 10)
                .map(dept => {
                    // Format time nicely
                    const formatTime = (timeStr) => {
                        if (!timeStr) return 'N/A';
                        // Handle GTFS times >24:00
                        const parts = timeStr.split(':');
                        let hours = parseInt(parts[0]);
                        const mins = parts[1];
                        if (hours >= 24) {
                            hours = hours - 24;
                            return `${hours.toString().padStart(2, '0')}:${mins} (next day)`;
                        }
                        return `${hours.toString().padStart(2, '0')}:${mins}`;
                    };
                    
                    return `
                        <div class="departure-item">
                            <div class="route-name">Route ${dept.route_name || dept.route_id}</div>
                            <div class="time">🚍 Departure: ${formatTime(dept.departure_time)}</div>
                            ${dept.arrival_time ? `<div class="time">🚏 Arrival: ${formatTime(dept.arrival_time)}</div>` : ''}
                            <div class="trip-id">Trip ID: ${dept.trip_id}</div>
                        </div>
                    `;
                }).join('');
            
            html += sortedDepartures;
            html += '</div>';
        } else {
            html += '<p class="placeholder">No departures found for this stop.</p>';
        }
        
        // Animate content appearance
        panelContent.style.opacity = '0';
        panelContent.innerHTML = html;
        setTimeout(() => {
            panelContent.style.transition = 'opacity 0.3s ease';
            panelContent.style.opacity = '1';
        }, 10);
        
    } catch (error) {
        console.error('Error loading departures:', error);
        panelContent.innerHTML = '<p class="placeholder">Error loading departures. Please try again.</p>';
    }
}

// Reset view button
document.addEventListener('DOMContentLoaded', function() {
    const resetBtn = document.getElementById('reset-view');
    const mapViewToggle = document.getElementById('map-view-toggle');
    const routeSelector = document.getElementById('route-selector');
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentRouteFilter = 'all';
            mapViewMode = 'routes'; // Reset to default (routes)
            selectedRoutes = [];
            
            const routeFilter = document.getElementById('route-filter');
            if (routeFilter) {
                routeFilter.value = 'all';
            }
            if (mapViewToggle) {
                mapViewToggle.value = 'routes'; // Reset to default (routes)
            }
            if (routeSelector) {
                Array.from(routeSelector.options).forEach(opt => opt.selected = false);
                if (routeSelector.options[0]) {
                    routeSelector.options[0].selected = true;
                }
            }
            // Reset selectedRoutes to ['all']
            selectedRoutes = ['all'];
            
            stopsData = allStops;
            
            // Animate reset
            resetBtn.textContent = 'Resetting...';
            resetBtn.disabled = true;
            
            setTimeout(() => {
                if (mapViewMode === 'routes' || mapViewMode === 'both') {
                    loadRoutePaths().then(() => {
                        updateDetailsPanelForViewMode();
                    }).catch((error) => {
                        console.error('Failed to load routes on reset:', error);
                    });
                } else {
                clearRoutePolylines();
                }
                
                if (mapViewMode === 'stops' || mapViewMode === 'both') {
                updateMapMarkers();
                } else {
                    // Clear markers when showing only routes
                    markers.forEach(marker => map.removeLayer(marker));
                    markers = [];
                }
                
                updateDetailsPanelForViewMode();
                resetBtn.textContent = 'Reset View';
                resetBtn.disabled = false;
            }, 300);
        });
    }
    
    // Add map view toggle listener
    if (mapViewToggle) {
        mapViewToggle.addEventListener('change', handleMapViewToggle);
    }
    
    // Add route selector listener
    if (routeSelector) {
        routeSelector.addEventListener('change', handleRouteSelection);
    }
    
    // Close panel button
    const closeBtn = document.getElementById('close-panel');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const panelContent = document.getElementById('panel-content');
            if (panelContent) {
                panelContent.innerHTML = '<p class="placeholder">Click on a stop marker to see details</p>';
            }
            
            // Reset highlighted marker
            if (currentStopMarker) {
                currentStopMarker.setIcon(createCustomIcon('#7A003C'));
                currentStopMarker = null;
            }
        });
    }
});

// Add CSS for bounce animation
const style = document.createElement('style');
style.textContent = `
    @keyframes bounce {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-10px) scale(1.1); }
    }
    
    .custom-popup .leaflet-popup-content-wrapper {
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    
    .custom-popup .leaflet-popup-content {
        margin: 12px;
    }
`;
document.head.appendChild(style);

// Navigation functionality
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page');
    
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetPage = button.getAttribute('data-page');
            
            // Update active nav button
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Show/hide pages
            pages.forEach(page => {
                page.classList.remove('active');
            });
            
            const targetPageElement = document.getElementById(`page-${targetPage}`);
            if (targetPageElement) {
                targetPageElement.classList.add('active');
            }
            
            // Initialize upload page if needed
            if (targetPage === 'upload') {
                if (typeof initUploadPage === 'function') {
                    initUploadPage();
                }
            }
            
            // Initialize archive page if needed
            if (targetPage === 'archive') {
                if (typeof initArchivePage === 'function') {
                    initArchivePage();
                }
            }
            
        });
    });
}

// Initialize app
async function init() {
    console.log('Initializing GTFS Dashboard...');
    
    // Setup navigation first
    setupNavigation();
    
    // Initialize home page
    initMap();
    
    // Load KPIs
    try {
        await loadKPIs();
    } catch (error) {
        console.error('Error loading KPIs:', error);
    }
    
    // Load routes for home page filter
    try {
        await loadRoutesForHome();
    } catch (error) {
        console.error('Error loading routes for filter:', error);
    }
    
    // Load routes on initialization if in routes mode
    if (mapViewMode === 'routes' || mapViewMode === 'both') {
        setTimeout(() => {
            loadRoutePaths().then(() => {
                console.log('Default routes loaded');
                updateDetailsPanelForViewMode();
            }).catch((error) => {
                console.error('Failed to load default routes:', error);
            });
        }, 500);
    }
    
    // Load stops after routes (for better marker colors)
    setTimeout(() => {
        loadStops();
        // Update details panel after stops load (if in stops or both mode)
        setTimeout(() => {
            if (mapViewMode === 'stops' || mapViewMode === 'both') {
                updateDetailsPanelForViewMode();
            }
    }, 500);
    }, 500);
    
    console.log('App initialized');
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

// Refresh KPIs every 30 seconds
setInterval(loadKPIs, 30000);
