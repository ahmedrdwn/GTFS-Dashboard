// Routes Page JavaScript

let allRoutesData = [];
let filteredRoutes = [];
let routeDetailMap = null;

// Initialize routes page
async function initRoutesPage() {
    console.log('Initializing routes page...');
    const grid = document.getElementById('routes-grid');
    if (grid) {
        grid.innerHTML = '<div class="loading">Loading routes...</div>';
    }
    
    try {
        // Only load if we haven't loaded before or data is empty
        if (!allRoutesData || allRoutesData.length === 0) {
            await loadRoutesForPage();
        } else {
            console.log('Using cached routes data');
            filteredRoutes = [...allRoutesData];
            renderRoutes();
        }
        setupFilters();
    } catch (error) {
        console.error('Error initializing routes page:', error);
        if (grid) {
            grid.innerHTML = '<div class="error-message">Error loading routes. Please try again.</div>';
        }
    }
}

// Load all routes with statistics (for routes page)
async function loadRoutesForPage() {
    const grid = document.getElementById('routes-grid');
    
    try {
        console.log('Fetching routes and KPIs...');
        const [routesResponse, kpisResponse] = await Promise.all([
            fetch('/api/routes'),
            fetch('/api/kpis')
        ]);
        
        if (!routesResponse.ok) {
            throw new Error(`Failed to fetch routes: ${routesResponse.status}`);
        }
        
        const routes = await routesResponse.json();
        const kpis = await kpisResponse.json();
        
        console.log(`Loaded ${routes.length} routes`);
        
        // Get route statistics (with timeout to avoid hanging)
        const statsPromises = routes.map(async (route) => {
            if (!route.route_id) {
                return {
                    ...route,
                    total_trips: 0,
                    trips_by_service: {}
                };
            }
            try {
                const statsResponse = await fetch(`/api/routes/${route.route_id}/stats`);
                if (!statsResponse.ok) {
                    throw new Error(`HTTP ${statsResponse.status}`);
                }
                const stats = await statsResponse.json();
                return {
                    ...route,
                    total_trips: stats.total_trips || 0,
                    trips_by_service: stats.trips_by_service || {}
                };
            } catch (error) {
                console.error(`Error loading stats for route ${route.route_id}:`, error);
                return {
                    ...route,
                    total_trips: 0,
                    trips_by_service: {}
                };
            }
        });
        
        // Load stats with progress indicator
        const routesWithStats = await Promise.all(statsPromises);
        console.log('Loaded route statistics');
        
        allRoutesData = routesWithStats;
        filteredRoutes = [...allRoutesData];
        
        renderRoutes();
    } catch (error) {
        console.error('Error loading routes:', error);
        if (grid) {
            grid.innerHTML = `<div class="error-message">Error loading routes: ${error.message}. Please try again.</div>`;
        }
    }
}

// Render routes grid
function renderRoutes() {
    const grid = document.getElementById('routes-grid');
    
    if (!grid) {
        console.error('Routes grid element not found!');
        return;
    }
    
    if (filteredRoutes.length === 0) {
        grid.innerHTML = '<div class="no-results">No routes found matching your filters.</div>';
        return;
    }
    
    console.log(`Rendering ${filteredRoutes.length} routes`);
    
    grid.innerHTML = filteredRoutes.map(route => {
        const routeColor = route.route_color ? `#${route.route_color}` : '#7A003C';
        const routeTextColor = route.route_text_color ? `#${route.route_text_color}` : '#ffffff';
        
        return `
            <div class="route-card" data-route-id="${route.route_id}">
                <div class="route-card-header" style="background: ${routeColor}; color: ${routeTextColor};">
                    <div class="route-number">${route.route_short_name || route.route_id}</div>
                    ${route.route_color ? `<div class="route-color-badge" style="background: ${routeColor};"></div>` : ''}
                </div>
                <div class="route-card-body">
                    <h3 class="route-name">${route.route_long_name || 'Route'}</h3>
                    <div class="route-stats">
                        <div class="stat-item">
                            <span class="stat-icon">🚏</span>
                            <span class="stat-value">${route.total_trips || 0}</span>
                            <span class="stat-label">Trips</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-icon">📍</span>
                            <span class="stat-value">${Object.keys(route.trips_by_service || {}).length}</span>
                            <span class="stat-label">Services</span>
                        </div>
                    </div>
                    ${route.route_desc ? `<p class="route-desc">${route.route_desc}</p>` : ''}
                    <div class="route-type-badge">${getRouteTypeLabel(route.route_type)}</div>
                </div>
                <div class="route-card-footer">
                    <button class="btn-view-details" onclick="showRouteDetails('${route.route_id}')">
                        View Details →
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Get route type label
function getRouteTypeLabel(routeType) {
    const types = {
        '0': 'Tram/Light Rail',
        '1': 'Subway/Metro',
        '2': 'Rail',
        '3': 'Bus',
        '4': 'Ferry',
        '5': 'Cable Tram',
        '6': 'Aerial Lift',
        '7': 'Funicular',
        '11': 'Trolleybus',
        '12': 'Monorail'
    };
    return types[routeType] || `Type ${routeType}`;
}

// Setup filters
function setupFilters() {
    const searchInput = document.getElementById('route-search');
    const serviceFilter = document.getElementById('service-filter');
    
    searchInput.addEventListener('input', (e) => {
        applyFilters(e.target.value, serviceFilter.value);
    });
    
    serviceFilter.addEventListener('change', (e) => {
        applyFilters(searchInput.value, e.target.value);
    });
}

// Apply filters
function applyFilters(searchTerm, serviceFilter) {
    filteredRoutes = allRoutesData.filter(route => {
        const matchesSearch = !searchTerm || 
            route.route_short_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            route.route_long_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            route.route_id.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesService = serviceFilter === 'all' ||
            Object.keys(route.trips_by_service || {}).some(service => 
                service.toLowerCase().includes(serviceFilter.toLowerCase())
            );
        
        return matchesSearch && matchesService;
    });
    
    renderRoutes();
}

// Show route details modal
async function showRouteDetails(routeId) {
    const modal = document.getElementById('route-detail-modal');
    const modalTitle = document.getElementById('modal-route-title');
    const modalBody = document.getElementById('modal-body');
    
    modal.style.display = 'flex';
    modalBody.innerHTML = '<div class="loading">Loading route details...</div>';
    
    try {
        // Load route details
        const [detailsResponse, stopsResponse] = await Promise.all([
            fetch(`/api/routes/${routeId}/details`),
            fetch(`/api/routes/${routeId}/stops`)
        ]);
        
        const details = await detailsResponse.json();
        const stops = await stopsResponse.json();
        
        const route = details.route;
        const routeColor = route.route_color ? `#${route.route_color}` : '#7A003C';
        const routeTextColor = route.route_text_color ? `#${route.route_text_color}` : '#ffffff';
        
        modalTitle.innerHTML = `
            <span style="background: ${routeColor}; color: ${routeTextColor}; padding: 8px 16px; border-radius: 8px; font-size: 1.2em; margin-right: 12px;">
                ${route.route_short_name || route.route_id}
            </span>
            ${route.route_long_name || 'Route Details'}
        `;
        
        // Create modal content
        let html = `
            <div class="route-detail-info">
                <div class="detail-section">
                    <h3>Route Information</h3>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Route ID:</span>
                            <span class="info-value">${route.route_id}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Total Trips:</span>
                            <span class="info-value">${details.total_trips}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Total Stops:</span>
                            <span class="info-value">${details.total_stops}</span>
                        </div>
                        ${details.avg_headway_minutes ? `
                        <div class="info-item">
                            <span class="info-label">Avg Headway:</span>
                            <span class="info-value">${details.avg_headway_minutes} min</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="detail-section">
                    <h3>Route Map</h3>
                    <div id="route-detail-map" style="height: 400px; border-radius: 12px; overflow: hidden; margin-bottom: 24px;"></div>
                </div>
                
                <div class="detail-section">
                    <h3>Trips (${details.trips.length})</h3>
                    <div class="trips-list">
        `;
        
        // Add trips
        details.trips.forEach(trip => {
            html += `
                <div class="trip-item">
                    <div class="trip-header">
                        <span class="trip-id">Trip ${trip.trip_id}</span>
                        ${trip.direction_id ? `<span class="direction-badge direction-${trip.direction_id}">${trip.direction_id === '0' ? '→' : '←'}</span>` : ''}
                    </div>
                    <div class="trip-details">
                        <div class="trip-stop">
                            <span class="stop-label">From:</span>
                            <span class="stop-name">${trip.first_stop_name}</span>
                            <span class="stop-time">${formatTime(trip.departure_time)}</span>
                        </div>
                        <div class="trip-stop">
                            <span class="stop-label">To:</span>
                            <span class="stop-name">${trip.last_stop_name}</span>
                            <span class="stop-time">${formatTime(trip.arrival_time)}</span>
                        </div>
                        <div class="trip-meta">
                            <span>Duration: ${trip.duration_minutes ? trip.duration_minutes + ' min' : 'N/A'}</span>
                            <span>Stops: ${trip.num_stops}</span>
                            <span>Service: ${trip.service_id || 'N/A'}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += `
                    </div>
                </div>
            </div>
        `;
        
        modalBody.innerHTML = html;
        
        // Initialize map
        initRouteDetailMap(stops, routeColor);
        
    } catch (error) {
        console.error('Error loading route details:', error);
        modalBody.innerHTML = '<div class="error-message">Error loading route details. Please try again.</div>';
    }
}

// Initialize route detail map
function initRouteDetailMap(stops, routeColor) {
    // Remove existing map if any
    if (routeDetailMap) {
        routeDetailMap.remove();
    }
    
    if (!stops || stops.length === 0) {
        document.getElementById('route-detail-map').innerHTML = 
            '<div style="padding: 40px; text-align: center; color: #999;">No stops available for this route.</div>';
        return;
    }
    
    // Create map
    routeDetailMap = L.map('route-detail-map').setView([stops[0].stop_lat, stops[0].stop_lon], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(routeDetailMap);
    
    // Add markers for each stop
    const markers = [];
    stops.forEach((stop, index) => {
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);
        
        if (isNaN(lat) || isNaN(lon)) return;
        
        const marker = L.marker([lat, lon], {
            icon: createRouteMarkerIcon(routeColor, index + 1)
        }).addTo(routeDetailMap)
        .bindPopup(`
            <strong>${stop.stop_name || stop.stop_id}</strong><br>
            Stop ID: ${stop.stop_id}
        `);
        
        markers.push(marker);
    });
    
    // Fit bounds to show all stops
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        routeDetailMap.fitBounds(group.getBounds().pad(0.1));
    }
}

// Create route marker icon
function createRouteMarkerIcon(color, number) {
    return L.divIcon({
        className: 'route-marker',
        html: `
            <div style="
                background: ${color};
                width: 35px;
                height: 35px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 14px;
            ">${number}</div>
        `,
        iconSize: [35, 35],
        iconAnchor: [17.5, 17.5]
    });
}

// Format time
function formatTime(timeStr) {
    if (!timeStr) return 'N/A';
    const parts = timeStr.split(':');
    let hours = parseInt(parts[0]);
    const mins = parts[1];
    if (hours >= 24) {
        hours = hours - 24;
        return `${hours.toString().padStart(2, '0')}:${mins} (next day)`;
    }
    return `${hours.toString().padStart(2, '0')}:${mins}`;
}

// Close modal
function closeRouteModal() {
    const modal = document.getElementById('route-detail-modal');
    modal.style.display = 'none';
    if (routeDetailMap) {
        routeDetailMap.remove();
        routeDetailMap = null;
    }
}

// Make functions global
window.initRoutesPage = initRoutesPage;
window.loadRoutesForPage = loadRoutesForPage;
window.showRouteDetails = showRouteDetails;
window.closeRouteModal = closeRouteModal;

// Setup modal close handlers
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('route-detail-modal');
    const closeBtn = document.getElementById('close-modal');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeRouteModal);
    }
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeRouteModal();
        }
    });
    
    // Close on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            closeRouteModal();
        }
    });
});

