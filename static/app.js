// GTFS Dashboard - Main Application JavaScript
// Rebuilt from scratch for reliability

// Global variables
let map = null;
let markers = [];
let routePolylines = [];
let allStops = [];
let stopsData = [];
let routesData = [];
let selectedRoutes = ['all'];
let mapViewMode = 'routes'; // Default: routes
let currentStopMarker = null;

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing GTFS Dashboard...');
    initApp();
});

// Main initialization function
async function initApp() {
    try {
        // Setup navigation
        setupNavigation();
        
        // Initialize home page
        if (document.getElementById('page-home')?.classList.contains('active')) {
            await initHomePage();
        }
        
        console.log('GTFS Dashboard initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Setup navigation between pages
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const targetPage = button.getAttribute('data-page');
            
            if (!targetPage) {
                console.error('No data-page attribute found on button');
                return;
            }
            
            console.log(`Navigating to page: ${targetPage}`);
            
            // Update active nav button
            navButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.disabled = true; // Prevent rapid clicking
            });
            button.classList.add('active');
            
            // Hide all pages
            const allPages = document.querySelectorAll('.page');
            allPages.forEach(page => {
                page.classList.remove('active');
                page.style.display = 'none';
            });
            
            // Show target page
            const targetPageElement = document.getElementById(`page-${targetPage}`);
            if (targetPageElement) {
                targetPageElement.style.display = 'block';
                targetPageElement.classList.add('active');
                
                // Initialize page-specific functionality
                try {
                    await initializePage(targetPage);
                } catch (error) {
                    console.error(`Error initializing page ${targetPage}:`, error);
                }
                
                // Re-enable buttons
                setTimeout(() => {
                    navButtons.forEach(btn => btn.disabled = false);
                }, 300);
                
            } else {
                console.error(`Page element not found: page-${targetPage}`);
                navButtons.forEach(btn => btn.disabled = false);
            }
        });
    });
}

// Initialize page-specific functionality
async function initializePage(pageName) {
    try {
        switch(pageName) {
            case 'home':
                await initHomePage();
                break;
            case 'upload':
                if (typeof initUploadPage === 'function') {
                    initUploadPage();
                }
                break;
            case 'archive':
                if (typeof initArchivePage === 'function') {
                    initArchivePage();
                }
                break;
            default:
                console.log(`No initialization needed for page: ${pageName}`);
        }
    } catch (error) {
        console.error(`Error initializing page ${pageName}:`, error);
    }
}

// ============ HOME PAGE FUNCTIONS ============

// Initialize home page
async function initHomePage() {
    console.log('Initializing home page...');
    
    try {
        // Initialize map
        initMap();
        
        // Load KPIs and routes in parallel
        await Promise.all([
            loadKPIs(),
            loadRoutesForHome()
        ]);
        
        // Load initial map view based on mode
        if (mapViewMode === 'routes' || mapViewMode === 'both') {
            await loadRoutePaths();
        }
        if (mapViewMode === 'stops' || mapViewMode === 'both') {
            await loadStops();
        }
        
        // Setup event listeners
        setupHomePageListeners();
        
        // Update details panel
        updateDetailsPanelForViewMode();
        
    } catch (error) {
        console.error('Error initializing home page:', error);
    }
}

// Setup event listeners for home page
function setupHomePageListeners() {
    // Map view toggle
    const mapViewToggle = document.getElementById('map-view-toggle');
    if (mapViewToggle) {
        mapViewToggle.addEventListener('change', handleMapViewToggle);
    }
    
    // Route selector
    const routeSelector = document.getElementById('route-selector');
    if (routeSelector) {
        routeSelector.addEventListener('change', handleRouteSelection);
    }
    
    // Reset view button
    const resetBtn = document.getElementById('reset-view');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            selectedRoutes = ['all'];
            mapViewMode = 'routes';
            if (routeSelector) {
                routeSelector.value = 'all';
            }
            if (mapViewToggle) {
                mapViewToggle.value = 'routes';
            }
            loadKPIs();
            loadRoutePaths();
            updateDetailsPanelForViewMode();
        });
    }
}

// Initialize map
function initMap() {
    if (map) {
        map.remove();
    }
    
    const mapElement = document.getElementById('map');
    if (!mapElement) return;
    
    map = L.map('map').setView([43.6532, -79.3832], 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
}

// Load KPIs
async function loadKPIs() {
    try {
        const response = await fetch('/api/kpis');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        // Update KPI cards
        updateElement('kpi-total-stops', data.total_stops || 0);
        updateElement('kpi-total-routes', data.total_routes || 0);
        updateElement('kpi-total-trips', data.total_trips || 0);
        updateElement('kpi-avg-headway', data.avg_headway_minutes?.toFixed(2) || '-');
        updateElement('kpi-avg-duration', data.avg_trip_duration_minutes?.toFixed(2) || '-');
        
    } catch (error) {
        console.error('Error loading KPIs:', error);
    }
}

// Load route-specific KPIs
async function loadRouteKPIs(routeId) {
    if (!routeId || routeId === 'all') {
        loadKPIs();
        return;
    }
    
    try {
        const response = await fetch(`/api/routes/${encodeURIComponent(routeId)}/details`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const route = data.route || {};
        
        // Get route name - prefer short_name, then long_name, fallback to ID
        let routeName = '';
        if (route.route_short_name && route.route_short_name.trim()) {
            routeName = route.route_short_name.trim();
            if (route.route_long_name && route.route_long_name.trim()) {
                routeName += ' - ' + route.route_long_name.trim();
            }
        } else if (route.route_long_name && route.route_long_name.trim()) {
            routeName = route.route_long_name.trim();
        } else {
            routeName = route.route_id || 'Route'; // Fallback to ID if no name available
        }
        
        // Calculate avg trip duration
        let avgDuration = '-';
        if (data.trips && data.trips.length > 0) {
            const durations = data.trips
                .map(t => t.duration_minutes)
                .filter(d => d !== null && d !== undefined);
            if (durations.length > 0) {
                avgDuration = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2);
            }
        }
        
        // Update KPI cards with route-specific data
        updateElement('kpi-total-stops', data.total_stops || 0);
        updateElement('kpi-total-routes', routeName);
        updateElement('kpi-total-trips', data.total_trips || 0);
        updateElement('kpi-avg-headway', data.avg_headway_minutes?.toFixed(2) || '-');
        updateElement('kpi-avg-duration', avgDuration);
        
    } catch (error) {
        console.error('Error loading route KPIs:', error);
        loadKPIs(); // Fallback to global KPIs
    }
}

// Load routes for home page filter
async function loadRoutesForHome() {
    try {
        const response = await fetch('/api/routes');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        routesData = await response.json();
        
        const routeFilter = document.getElementById('route-filter');
        const routeSelector = document.getElementById('route-selector');
        
        // Clear existing options
        if (routeFilter) {
            routeFilter.innerHTML = '<option value="all">All Routes</option>';
        }
        if (routeSelector) {
            routeSelector.innerHTML = '<option value="all">All Routes</option>';
        }
        
        // Add routes to dropdowns
        routesData.forEach(route => {
            const routeId = route.route_id || '';
            
            // Get route name - prefer short_name, then long_name, fallback to ID
            let routeName = '';
            if (route.route_short_name && route.route_short_name.trim()) {
                routeName = route.route_short_name.trim();
                if (route.route_long_name && route.route_long_name.trim()) {
                    routeName += ' - ' + route.route_long_name.trim();
                }
            } else if (route.route_long_name && route.route_long_name.trim()) {
                routeName = route.route_long_name.trim();
            } else {
                routeName = routeId; // Fallback to ID if no name available
            }
            
            if (routeFilter) {
                const option = document.createElement('option');
                option.value = routeId;
                option.textContent = routeName;
                routeFilter.appendChild(option);
            }
            
            if (routeSelector) {
                const option = document.createElement('option');
                option.value = routeId;
                option.textContent = routeName;
                routeSelector.appendChild(option);
            }
        });
        
        // Set default selection
        selectedRoutes = ['all'];
        if (routeSelector) {
            routeSelector.value = 'all';
        }
        
    } catch (error) {
        console.error('Error loading routes:', error);
    }
}

// Handle map view toggle
async function handleMapViewToggle(event) {
    mapViewMode = event.target.value;
    
    if (mapViewMode === 'stops') {
        clearRoutePolylines();
        await loadStops();
    } else if (mapViewMode === 'routes') {
        clearMarkers();
        await loadRoutePaths();
    } else if (mapViewMode === 'both') {
        await Promise.all([loadStops(), loadRoutePaths()]);
    }
    
    updateDetailsPanelForViewMode();
}

// Handle route selection
async function handleRouteSelection(event) {
    const options = Array.from(event.target.selectedOptions);
    selectedRoutes = options.map(opt => opt.value);
    
    // If 'all' is selected, show global KPIs
    if (selectedRoutes.includes('all') || selectedRoutes.length === 0) {
        selectedRoutes = ['all'];
        loadKPIs();
    } else if (selectedRoutes.length === 1) {
        // Single route selected - show route-specific KPIs
        await loadRouteKPIs(selectedRoutes[0]);
    } else {
        // Multiple routes - show first route's KPIs
        await loadRouteKPIs(selectedRoutes[0]);
    }
    
    // Reload route paths if in routes or both mode
    if (mapViewMode === 'routes' || mapViewMode === 'both') {
        await loadRoutePaths();
    }
}

// Load route paths
async function loadRoutePaths() {
    clearRoutePolylines();
    
    if (mapViewMode !== 'routes' && mapViewMode !== 'both') {
        return;
    }
    
    try {
        const response = await fetch('/api/routes/paths');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const allPaths = await response.json();
        if (!allPaths || allPaths.length === 0) {
            console.warn('No route paths returned');
            return;
        }
        
        const colors = [
            '#7A003C', '#FDBF57', '#3498db', '#e74c3c', '#2ecc71',
            '#9b59b6', '#f39c12', '#1abc9c', '#e67e22', '#34495e'
        ];
        
        allPaths.forEach((routePath, index) => {
            const route = routePath.route || {};
            const coordinates = routePath.coordinates || [];
            
            if (coordinates.length < 2) return;
            
            // Check if route should be displayed
            const routeId = routePath.route_id || '';
            const shouldDisplay = 
                selectedRoutes.includes('all') || 
                selectedRoutes.includes(routeId);
            
            if (!shouldDisplay) return;
            
            // Get color for route
            const routeColor = colors[index % colors.length];
            
            // Create polyline
            const polyline = L.polyline(coordinates, {
                color: routeColor,
                weight: 6,
                opacity: 0.8
            }).addTo(map);
            
            // Add popup - format route name properly
            let routeName = '';
            if (route.route_short_name && route.route_short_name.trim()) {
                routeName = route.route_short_name.trim();
                if (route.route_long_name && route.route_long_name.trim()) {
                    routeName += ' - ' + route.route_long_name.trim();
                }
            } else if (route.route_long_name && route.route_long_name.trim()) {
                routeName = route.route_long_name.trim();
            } else {
                routeName = routeId; // Fallback to ID
            }
            polyline.bindPopup(`<strong>Route:</strong> ${routeName}`);
            
            // Add click handler
            polyline.on('click', () => {
                showRouteDetailsInPanel(routeId);
            });
            
            routePolylines.push(polyline);
        });
        
        // Fit map to bounds
        if (routePolylines.length > 0) {
            const bounds = L.latLngBounds([]);
            routePolylines.forEach(polyline => {
                try {
                    bounds.extend(polyline.getBounds());
                } catch (e) {
                    console.warn('Error extending bounds:', e);
                }
            });
            if (bounds.isValid()) {
                map.fitBounds(bounds);
            }
        }
        
        updateDetailsPanelForViewMode();
        
    } catch (error) {
        console.error('Error loading route paths:', error);
    }
}

// Load stops
async function loadStops() {
    clearMarkers();
    
    if (mapViewMode !== 'stops' && mapViewMode !== 'both') {
        return;
    }
    
    try {
        const response = await fetch('/api/stops');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        allStops = await response.json();
        stopsData = allStops;
        
        allStops.forEach(stop => {
            const lat = parseFloat(stop.stop_lat);
            const lon = parseFloat(stop.stop_lon);
            
            if (isNaN(lat) || isNaN(lon)) return;
            
            const marker = L.marker([lat, lon]).addTo(map);
            
            // Format stop name - use stop_name from GTFS
            const stopName = stop.stop_name || stop.stop_id || 'Stop';
            const stopId = stop.stop_id || 'N/A';
            marker.bindPopup(`<strong>${stopName}</strong><br>ID: ${stopId}`);
            
            marker.on('click', () => {
                showStopDetailsInPanel(stop.stop_id);
            });
            
            markers.push(marker);
        });
        
        // Fit map to markers
        if (markers.length > 0) {
            const bounds = L.latLngBounds([]);
            markers.forEach(marker => {
                bounds.extend(marker.getLatLng());
            });
            map.fitBounds(bounds);
        }
        
        updateDetailsPanelForViewMode();
        
    } catch (error) {
        console.error('Error loading stops:', error);
    }
}

// Update details panel based on view mode
async function updateDetailsPanelForViewMode() {
    const panelContent = document.getElementById('panel-content');
    const panelTitle = document.getElementById('panel-title');
    
    if (!panelContent || !panelTitle) return;
    
    if (mapViewMode === 'routes') {
        panelTitle.textContent = 'Routes';
        panelContent.innerHTML = '<div class="loading">Loading routes...</div>';
        
        // Show routes summary
        if (routesData.length > 0) {
            const html = routesData.slice(0, 20).map(route => {
                // Format route name properly
                let routeName = '';
                if (route.route_short_name && route.route_short_name.trim()) {
                    routeName = route.route_short_name.trim();
                    if (route.route_long_name && route.route_long_name.trim()) {
                        routeName += ' - ' + route.route_long_name.trim();
                    }
                } else if (route.route_long_name && route.route_long_name.trim()) {
                    routeName = route.route_long_name.trim();
                } else {
                    routeName = route.route_id || 'Route';
                }
                return `<div class="detail-item" onclick="showRouteDetailsInPanel('${route.route_id}')">
                    <strong>${routeName}</strong>
                </div>`;
            }).join('');
            panelContent.innerHTML = html || '<div>No routes found</div>';
        } else {
            panelContent.innerHTML = '<div>No routes available</div>';
        }
    } else if (mapViewMode === 'stops') {
        panelTitle.textContent = 'Stops';
        panelContent.innerHTML = '<div class="loading">Loading stops...</div>';
        
        // Show stops summary
        if (allStops.length > 0) {
            const html = allStops.slice(0, 20).map(stop => {
                // Use stop_name from GTFS, fallback to stop_id
                const stopName = stop.stop_name && stop.stop_name.trim() ? stop.stop_name.trim() : stop.stop_id;
                return `<div class="detail-item" onclick="showStopDetailsInPanel('${stop.stop_id}')">
                    <strong>${stopName}</strong>
                </div>`;
            }).join('');
            panelContent.innerHTML = html || '<div>No stops found</div>';
        } else {
            panelContent.innerHTML = '<div>No stops available</div>';
        }
    } else {
        panelTitle.textContent = 'Details';
        panelContent.innerHTML = '<div>Select a route or stop to view details</div>';
    }
}

// Show route details in panel
async function showRouteDetailsInPanel(routeId) {
    if (!routeId) return;
    
    const panelContent = document.getElementById('panel-content');
    const panelTitle = document.getElementById('panel-title');
    
    if (!panelContent || !panelTitle) return;
    
    panelContent.innerHTML = '<div class="loading">Loading route details...</div>';
    
    try {
        const response = await fetch(`/api/routes/${encodeURIComponent(routeId)}/details`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const route = data.route || {};
        
        // Format route name properly
        let routeName = '';
        if (route.route_short_name && route.route_short_name.trim()) {
            routeName = route.route_short_name.trim();
            if (route.route_long_name && route.route_long_name.trim()) {
                routeName += ' - ' + route.route_long_name.trim();
            }
        } else if (route.route_long_name && route.route_long_name.trim()) {
            routeName = route.route_long_name.trim();
        } else {
            routeName = routeId || 'Route';
        }
        
        panelTitle.textContent = `Route: ${routeName}`;
        
        let html = `<div class="detail-section">
            <h3>Route Information</h3>
            <p><strong>Route ID:</strong> ${routeId}</p>
            <p><strong>Name:</strong> ${routeName}</p>
            <p><strong>Total Trips:</strong> ${data.total_trips || 0}</p>
            <p><strong>Total Stops:</strong> ${data.total_stops || 0}</p>
            <p><strong>Avg Headway:</strong> ${data.avg_headway_minutes?.toFixed(2) || '-'} min</p>
        </div>`;
        
        if (data.trips && data.trips.length > 0) {
            html += `<div class="detail-section">
                <h3>Recent Trips (${data.trips.length})</h3>
                ${data.trips.slice(0, 10).map(trip => `
                    <div class="detail-item">
                        <strong>Trip:</strong> ${trip.trip_id || 'N/A'}<br>
                        <strong>Duration:</strong> ${trip.duration_minutes?.toFixed(2) || '-'} min<br>
                        <strong>Stops:</strong> ${trip.num_stops || 0}
                    </div>
                `).join('')}
            </div>`;
        }
        
        panelContent.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading route details:', error);
        panelContent.innerHTML = `<div class="error-message">Error loading route details: ${error.message}</div>`;
    }
}

// Show stop details in panel
async function showStopDetailsInPanel(stopId) {
    if (!stopId) return;
    
    const panelContent = document.getElementById('panel-content');
    const panelTitle = document.getElementById('panel-title');
    
    if (!panelContent || !panelTitle) return;
    
    panelContent.innerHTML = '<div class="loading">Loading stop details...</div>';
    
    try {
        const response = await fetch(`/api/stops/${encodeURIComponent(stopId)}/departures`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const stop = data.stop || {};
        
        // Use stop_name from GTFS, ensure it's displayed correctly
        const stopName = (stop.stop_name && stop.stop_name.trim()) ? stop.stop_name.trim() : stopId;
        panelTitle.textContent = `Stop: ${stopName}`;
        
        let html = `<div class="detail-section">
            <h3>Stop Information</h3>
            <p><strong>Stop ID:</strong> ${stopId}</p>
            <p><strong>Name:</strong> ${stop.stop_name || 'N/A'}</p>
            <p><strong>Description:</strong> ${stop.stop_desc || 'N/A'}</p>
        </div>`;
        
        if (data.departures && data.departures.length > 0) {
            html += `<div class="detail-section">
                <h3>Upcoming Departures (${data.departures.length})</h3>
                ${data.departures.slice(0, 10).map(dep => `
                    <div class="detail-item">
                        <strong>Route:</strong> ${(dep.route_short_name && dep.route_short_name.trim()) || (dep.route_long_name && dep.route_long_name.trim()) || dep.route_id || 'N/A'}<br>
                        <strong>Time:</strong> ${dep.departure_time || 'N/A'}<br>
                        <strong>Trip:</strong> ${dep.trip_id || 'N/A'}
                    </div>
                `).join('')}
            </div>`;
        }
        
        panelContent.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading stop details:', error);
        panelContent.innerHTML = `<div class="error-message">Error loading stop details: ${error.message}</div>`;
    }
}

// Helper functions
function clearMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

function clearRoutePolylines() {
    routePolylines.forEach(polyline => map.removeLayer(polyline));
    routePolylines = [];
}

function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// Make functions globally accessible for onclick handlers
window.showRouteDetailsInPanel = showRouteDetailsInPanel;
window.showStopDetailsInPanel = showStopDetailsInPanel;
