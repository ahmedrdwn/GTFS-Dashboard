"""
GTFS Dashboard Web Application - Flask Backend
Serves GTFS data and calculates KPIs
"""
from flask import Flask, jsonify, send_from_directory, request, render_template_string
from flask_cors import CORS
import csv
import os
import zipfile
import tempfile
import shutil
import json
from datetime import datetime, timezone
from collections import defaultdict
from werkzeug.utils import secure_filename
from db import db, GTFSUpload, Route, Trip, Stop, StopTime

app = Flask(__name__, static_folder='static')
CORS(app)

# Database configuration
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(basedir, "gtfs_uploads.db")}?check_same_thread=False'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
    'connect_args': {'check_same_thread': False, 'timeout': 30}
}

# Initialize database
db.init_app(app)

# Helper function for database operations with retry
def db_operation_with_retry(operation, max_retries=3, retry_delay=0.1):
    """Execute database operation with retry logic for handling locks"""
    import time
    for attempt in range(max_retries):
        try:
            with app.app_context():
                result = operation()
                db.session.commit()
                return result
        except Exception as e:
            db.session.rollback()
            if 'locked' in str(e).lower() and attempt < max_retries - 1:
                time.sleep(retry_delay * (attempt + 1))
                continue
            raise
    raise Exception('Database operation failed after retries')

# Path to GTFS files
GTFS_DIR = os.path.dirname(os.path.abspath(__file__))

# Track current active upload (optional - can be set via API)
CURRENT_ACTIVE_UPLOAD_ID = None

# Allowed file extensions
ALLOWED_EXTENSIONS = {'zip'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def parse_time_to_seconds(time_str):
    """Convert GTFS time (HH:MM:SS or >24:00) to seconds since midnight"""
    if not time_str:
        return None
    try:
        parts = time_str.split(':')
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(parts[2])
        return hours * 3600 + minutes * 60 + seconds
    except:
        return None

def load_csv(filepath):
    """Load CSV file and return list of dictionaries"""
    data = []
    if not os.path.exists(filepath):
        print(f"WARNING: File not found: {filepath}")
        return data
    
    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:  # utf-8-sig handles BOM
            reader = csv.DictReader(f)
            data = []
            for row in reader:
                # Strip whitespace from keys and values
                clean_row = {}
                for key, value in row.items():
                    clean_key = key.strip() if key else key
                    clean_value = value.strip() if value else value
                    clean_row[clean_key] = clean_value
                data.append(clean_row)
            
            # Debug: Print first row to see column names
            if data and filepath.endswith('routes.txt'):
                print(f"DEBUG: routes.txt columns = {list(data[0].keys())}")
                print(f"DEBUG: First route row = {data[0]}")
                print(f"DEBUG: route_id from first row = '{data[0].get('route_id', 'NOT FOUND')}'")
            
    except Exception as e:
        print(f"ERROR loading CSV {filepath}: {e}")
        import traceback
        traceback.print_exc()
    
    return data

@app.route('/')
def index():
    """Serve main HTML page"""
    return send_from_directory('static', 'index.html')

@app.route('/api/stops')
def get_stops():
    """Get all stops with coordinates"""
    stops = load_csv(os.path.join(GTFS_DIR, 'stops.txt'))
    # Convert coordinates to float
    for stop in stops:
        if 'stop_lat' in stop and stop['stop_lat']:
            try:
                stop['stop_lat'] = float(stop['stop_lat'])
            except:
                stop['stop_lat'] = None
        if 'stop_lon' in stop and stop['stop_lon']:
            try:
                stop['stop_lon'] = float(stop['stop_lon'])
            except:
                stop['stop_lon'] = None
    return jsonify(stops)

@app.route('/api/routes')
def get_routes():
    """Get all routes"""
    routes_file = os.path.join(GTFS_DIR, 'routes.txt')
    if not os.path.exists(routes_file):
        print(f"WARNING: routes.txt not found at {routes_file}")
        return jsonify([])
    
    routes = load_csv(routes_file)
    print(f"/api/routes: Returning {len(routes)} routes")
    return jsonify(routes)

@app.route('/api/trips')
def get_trips():
    """Get all trips"""
    trips = load_csv(os.path.join(GTFS_DIR, 'trips.txt'))
    return jsonify(trips)

@app.route('/api/stop_times')
def get_stop_times():
    """Get all stop times with time converted to seconds"""
    stop_times = load_csv(os.path.join(GTFS_DIR, 'stop_times.txt'))
    
    # Add time in seconds and link route_id
    trips_data = load_csv(os.path.join(GTFS_DIR, 'trips.txt'))
    trip_to_route = {trip['trip_id']: trip['route_id'] for trip in trips_data if 'trip_id' in trip and 'route_id' in trip}
    
    for st in stop_times:
        if 'arrival_time' in st:
            st['arrival_sec'] = parse_time_to_seconds(st['arrival_time'])
        if 'departure_time' in st:
            st['departure_sec'] = parse_time_to_seconds(st['departure_time'])
        if 'trip_id' in st and st['trip_id'] in trip_to_route:
            st['route_id'] = trip_to_route[st['trip_id']]
    
    return jsonify(stop_times)

@app.route('/api/kpis')
def get_kpis():
    """Calculate and return KPIs"""
    routes_file = os.path.join(GTFS_DIR, 'routes.txt')
    trips_file = os.path.join(GTFS_DIR, 'trips.txt')
    stop_times_file = os.path.join(GTFS_DIR, 'stop_times.txt')
    
    # Check if files exist
    if not os.path.exists(routes_file):
        print(f"WARNING: routes.txt not found at {routes_file}")
        return jsonify({
            'total_routes': 0,
            'total_trips': 0,
            'avg_headway_minutes': 0,
            'avg_trip_duration_minutes': 0,
            'total_stops': 0,
            'error': 'routes.txt file not found'
        })
    
    routes = load_csv(routes_file)
    trips = load_csv(trips_file)
    stop_times = load_csv(stop_times_file)
    trips_data = load_csv(trips_file)
    
    print(f"KPI Calculation: Loaded {len(routes)} routes, {len(trips)} trips, {len(stop_times)} stop_times")
    
    trip_to_route = {trip['trip_id']: trip['route_id'] for trip in trips_data if 'trip_id' in trip and 'route_id' in trip}
    
    # KPI A: Total unique routes - handle None values
    route_ids = []
    for r in routes:
        route_id = r.get('route_id')
        if route_id is not None:
            route_id = str(route_id).strip()
            if route_id:
                route_ids.append(route_id)
    
    unique_routes = len(set(route_ids)) if route_ids else 0
    
    print(f"KPI: Loaded {len(routes)} routes, found {len(route_ids)} with route_id, unique = {unique_routes}")
    
    # Debug: Show first few route_ids
    if route_ids:
        print(f"KPI: First 5 route_ids = {route_ids[:5]}")
    else:
        print(f"KPI ERROR: No valid route_ids found! First route = {routes[0] if routes else 'N/A'}")
    
    # KPI B: Total unique trips - handle whitespace
    trip_ids = [t.get('trip_id', '').strip() for t in trips if t.get('trip_id')]
    unique_trips = len(set(trip_ids)) if trip_ids else 0
    
    # KPI C: Average headway per route (at first stop)
    # Calculate headway = time between consecutive departures at same stop for same route
    headways = []
    route_stop_times = defaultdict(list)
    
    for st in stop_times:
        if 'stop_id' in st and 'trip_id' in st and st['trip_id'] in trip_to_route:
            route_id = trip_to_route[st['trip_id']]
            dep_sec = parse_time_to_seconds(st.get('departure_time', ''))
            if dep_sec is not None:
                route_stop_times[(route_id, st['stop_id'])].append({
                    'trip_id': st['trip_id'],
                    'departure_sec': dep_sec,
                    'route_id': route_id
                })
    
    # Calculate headways for each route-stop combination
    for (route_id, stop_id), times in route_stop_times.items():
        times.sort(key=lambda x: x['departure_sec'])
        for i in range(1, len(times)):
            headway = times[i]['departure_sec'] - times[i-1]['departure_sec']
            if headway > 0:
                headways.append(headway)
    
    avg_headway_sec = sum(headways) / len(headways) if headways else 0
    avg_headway_min = avg_headway_sec / 60
    
    # KPI D: Average trip duration
    trip_durations = []
    trip_times = defaultdict(lambda: {'first': None, 'last': None})
    
    for st in stop_times:
        trip_id = st.get('trip_id')
        if not trip_id:
            continue
        
        arr_sec = parse_time_to_seconds(st.get('arrival_time', ''))
        dep_sec = parse_time_to_seconds(st.get('departure_time', ''))
        
        if arr_sec is not None:
            if trip_times[trip_id]['first'] is None or arr_sec < trip_times[trip_id]['first']:
                trip_times[trip_id]['first'] = arr_sec
            if trip_times[trip_id]['last'] is None or arr_sec > trip_times[trip_id]['last']:
                trip_times[trip_id]['last'] = arr_sec
        
        if dep_sec is not None:
            if trip_times[trip_id]['first'] is None or dep_sec < trip_times[trip_id]['first']:
                trip_times[trip_id]['first'] = dep_sec
            if trip_times[trip_id]['last'] is None or dep_sec > trip_times[trip_id]['last']:
                trip_times[trip_id]['last'] = dep_sec
    
    for trip_id, times in trip_times.items():
        if times['first'] is not None and times['last'] is not None:
            duration = times['last'] - times['first']
            if duration > 0:
                trip_durations.append(duration)
    
    avg_duration_sec = sum(trip_durations) / len(trip_durations) if trip_durations else 0
    avg_duration_min = avg_duration_sec / 60
    
    total_stops = len(load_csv(os.path.join(GTFS_DIR, 'stops.txt')))
    
    result = {
        'total_routes': unique_routes,
        'total_trips': unique_trips,
        'avg_headway_minutes': round(avg_headway_min, 2),
        'avg_trip_duration_minutes': round(avg_duration_min, 2),
        'total_stops': total_stops
    }
    
    print(f"KPI Result: {result}")
    return jsonify(result)

@app.route('/api/stops/<stop_id>/departures')
def get_stop_departures(stop_id):
    """Get upcoming departures for a specific stop"""
    stop_times = load_csv(os.path.join(GTFS_DIR, 'stop_times.txt'))
    trips_data = load_csv(os.path.join(GTFS_DIR, 'trips.txt'))
    routes_data = load_csv(os.path.join(GTFS_DIR, 'routes.txt'))
    
    trip_to_route = {trip['trip_id']: trip['route_id'] for trip in trips_data if 'trip_id' in trip and 'route_id' in trip}
    route_info = {r['route_id']: r for r in routes_data if 'route_id' in r}
    
    departures = []
    for st in stop_times:
        if st.get('stop_id') == stop_id and 'departure_time' in st:
            route_id = trip_to_route.get(st.get('trip_id'))
            route_name = route_info.get(route_id, {}).get('route_short_name', route_id) if route_id else 'N/A'
            
            departures.append({
                'trip_id': st.get('trip_id'),
                'route_id': route_id,
                'route_name': route_name,
                'departure_time': st.get('departure_time'),
                'arrival_time': st.get('arrival_time'),
                'stop_sequence': st.get('stop_sequence')
            })
    
    # Sort by departure time
    departures.sort(key=lambda x: x['departure_time'] if x['departure_time'] else '')
    
    return jsonify(departures[:20])  # Return next 20 departures

@app.route('/api/routes/<route_id>/stops')
def get_route_stops(route_id):
    """Get all stops for a specific route"""
    if not route_id or route_id == 'undefined':
        return jsonify([])
    
    try:
        trips_data = load_csv(os.path.join(GTFS_DIR, 'trips.txt'))
        stop_times = load_csv(os.path.join(GTFS_DIR, 'stop_times.txt'))
        stops_data = load_csv(os.path.join(GTFS_DIR, 'stops.txt'))
        
        # Get all trip_ids for this route
        route_trip_ids = {trip['trip_id'] for trip in trips_data if trip.get('route_id') == route_id}
    
        # Get all stop_ids used by these trips
        route_stop_ids = {st['stop_id'] for st in stop_times if st.get('trip_id') in route_trip_ids}
        
        # Get full stop info
        route_stops = [stop for stop in stops_data if stop.get('stop_id') in route_stop_ids]
        
        # Add coordinates as floats
        for stop in route_stops:
            if 'stop_lat' in stop:
                try:
                    stop['stop_lat'] = float(stop['stop_lat'])
                except:
                    stop['stop_lat'] = None
            if 'stop_lon' in stop:
                try:
                    stop['stop_lon'] = float(stop['stop_lon'])
                except:
                    stop['stop_lon'] = None
        
        return jsonify(route_stops)
    except Exception as e:
        print(f"Error getting route stops for {route_id}: {e}")
        return jsonify([])

@app.route('/api/routes/<route_id>/details')
def get_route_details(route_id):
    """Get detailed information for a specific route"""
    if not route_id or route_id == 'undefined':
        return jsonify({'error': 'Invalid route_id'}), 400
    
    try:
        routes_data = load_csv(os.path.join(GTFS_DIR, 'routes.txt'))
        trips_data = load_csv(os.path.join(GTFS_DIR, 'trips.txt'))
        stop_times = load_csv(os.path.join(GTFS_DIR, 'stop_times.txt'))
        stops_data = load_csv(os.path.join(GTFS_DIR, 'stops.txt'))
        
        # Get route info
        route = next((r for r in routes_data if r.get('route_id') == route_id), None)
        if not route:
            return jsonify({'error': 'Route not found'}), 404
        
        # Get all trips for this route
        route_trips = [trip for trip in trips_data if trip.get('route_id') == route_id]
        
        # Calculate trip details
        trips_with_details = []
        for trip in route_trips:
            trip_id = trip.get('trip_id')
            trip_stop_times = [st for st in stop_times if st.get('trip_id') == trip_id]
            
            if trip_stop_times:
                # Sort by stop_sequence
                trip_stop_times.sort(key=lambda x: int(x.get('stop_sequence', 0)))
                first_stop = trip_stop_times[0]
                last_stop = trip_stop_times[-1]
                
                # Get stop names
                first_stop_info = next((s for s in stops_data if s.get('stop_id') == first_stop.get('stop_id')), {})
                last_stop_info = next((s for s in stops_data if s.get('stop_id') == last_stop.get('stop_id')), {})
                
                # Calculate duration
                dep_sec = parse_time_to_seconds(first_stop.get('departure_time', ''))
                arr_sec = parse_time_to_seconds(last_stop.get('arrival_time', ''))
                duration_sec = arr_sec - dep_sec if arr_sec and dep_sec else None
                duration_min = duration_sec / 60 if duration_sec else None
                
                trips_with_details.append({
                    'trip_id': trip_id,
                    'service_id': trip.get('service_id'),
                    'direction_id': trip.get('direction_id'),
                    'trip_headsign': trip.get('trip_headsign'),
                    'first_stop_id': first_stop.get('stop_id'),
                    'first_stop_name': first_stop_info.get('stop_name', 'N/A'),
                    'last_stop_id': last_stop.get('stop_id'),
                    'last_stop_name': last_stop_info.get('stop_name', 'N/A'),
                    'departure_time': first_stop.get('departure_time'),
                    'arrival_time': last_stop.get('arrival_time'),
                    'duration_minutes': round(duration_min, 2) if duration_min else None,
                    'num_stops': len(trip_stop_times)
                })
        
        # Calculate average headway for this route
        # Group stop_times by stop_id and route
        route_stop_times = []
        for st in stop_times:
            if st.get('trip_id') in {t.get('trip_id') for t in route_trips}:
                route_stop_times.append(st)
        
        # Calculate headway at first stop (simplified)
        first_stop_headways = []
        if route_stop_times:
            first_stops_by_trip = {}
            for st in route_stop_times:
                trip_id = st.get('trip_id')
                if trip_id not in first_stops_by_trip:
                    first_stops_by_trip[trip_id] = st
                else:
                    if int(st.get('stop_sequence', 999)) < int(first_stops_by_trip[trip_id].get('stop_sequence', 999)):
                        first_stops_by_trip[trip_id] = st
            
            first_stop_times = []
            for st in first_stops_by_trip.values():
                dep_sec = parse_time_to_seconds(st.get('departure_time', ''))
                if dep_sec:
                    first_stop_times.append(dep_sec)
            
            first_stop_times.sort()
            for i in range(1, len(first_stop_times)):
                headway = first_stop_times[i] - first_stop_times[i-1]
                if headway > 0:
                    first_stop_headways.append(headway / 60)  # Convert to minutes
        
        avg_headway = sum(first_stop_headways) / len(first_stop_headways) if first_stop_headways else None
        
        return jsonify({
            'route': route,
            'total_trips': len(route_trips),
            'trips': trips_with_details,
            'avg_headway_minutes': round(avg_headway, 2) if avg_headway else None,
            'total_stops': len(set(st.get('stop_id') for st in route_stop_times))
        })
    except Exception as e:
        print(f"Error getting route details for {route_id}: {e}")
        return jsonify({'error': f'Error loading route details: {str(e)}'}), 500

@app.route('/api/routes/<route_id>/stats')
def get_route_stats(route_id):
    """Get statistics for a route"""
    if not route_id or route_id == 'undefined':
        return jsonify({
            'total_trips': 0,
            'trips_by_service': {}
        })
    
    try:
        trips_data = load_csv(os.path.join(GTFS_DIR, 'trips.txt'))
        stop_times = load_csv(os.path.join(GTFS_DIR, 'stop_times.txt'))
        
        route_trips = [trip for trip in trips_data if trip.get('route_id') == route_id]
        route_trip_ids = {trip.get('trip_id') for trip in route_trips if trip.get('trip_id')}
        
        route_stop_times = [st for st in stop_times if st.get('trip_id') in route_trip_ids]
        
        # Count trips per service
        service_counts = {}
        for trip in route_trips:
            service_id = trip.get('service_id', 'unknown')
            service_counts[service_id] = service_counts.get(service_id, 0) + 1
        
        return jsonify({
            'total_trips': len(route_trips),
            'trips_by_service': service_counts
        })
    except Exception as e:
        print(f"Error getting route stats for {route_id}: {e}")
        return jsonify({
            'total_trips': 0,
            'trips_by_service': {}
        })

@app.route('/api/routes/<route_id>/path')
def get_route_path(route_id):
    """Get ordered stop coordinates for a route path (polyline)"""
    trips_data = load_csv(os.path.join(GTFS_DIR, 'trips.txt'))
    stop_times = load_csv(os.path.join(GTFS_DIR, 'stop_times.txt'))
    stops_data = load_csv(os.path.join(GTFS_DIR, 'stops.txt'))
    
    # Get all trip_ids for this route
    route_trip_ids = {trip['trip_id'] for trip in trips_data if trip.get('route_id') == route_id}
    
    if not route_trip_ids:
        return jsonify({'error': 'No trips found for route'}), 404
    
    # Get stop_times for these trips and order by stop_sequence
    route_stop_times = [st for st in stop_times if st.get('trip_id') in route_trip_ids]
    
    # Group by trip_id and get ordered stops
    trip_paths = {}
    for st in route_stop_times:
        trip_id = st.get('trip_id')
        if trip_id not in trip_paths:
            trip_paths[trip_id] = []
        trip_paths[trip_id].append(st)
    
    # Sort each trip's stops by stop_sequence
    for trip_id in trip_paths:
        trip_paths[trip_id].sort(key=lambda x: int(x.get('stop_sequence', 0)))
    
    # Get the most representative trip (usually the longest or first)
    if trip_paths:
        # Use the trip with the most stops
        best_trip_id = max(trip_paths.keys(), key=lambda tid: len(trip_paths[tid]))
        ordered_stops = trip_paths[best_trip_id]
        
        # Build path coordinates
        path_coordinates = []
        stop_info = []
        
        for st in ordered_stops:
            stop_id = st.get('stop_id')
            stop = next((s for s in stops_data if s.get('stop_id') == stop_id), None)
            
            if stop:
                try:
                    lat = float(stop.get('stop_lat', 0))
                    lon = float(stop.get('stop_lon', 0))
                    if lat != 0 and lon != 0:
                        path_coordinates.append([lat, lon])
                        stop_info.append({
                            'stop_id': stop_id,
                            'stop_name': stop.get('stop_name'),
                            'stop_sequence': int(st.get('stop_sequence', 0))
                        })
                except:
                    continue
        
        return jsonify({
            'route_id': route_id,
            'coordinates': path_coordinates,
            'stops': stop_info,
            'total_stops': len(path_coordinates)
        })
    
    return jsonify({'error': 'No path found for route'}), 404

@app.route('/api/routes/paths')
def get_all_route_paths():
    """Get paths for all routes"""
    routes_file = os.path.join(GTFS_DIR, 'routes.txt')
    if not os.path.exists(routes_file):
        print(f"WARNING: routes.txt not found at {routes_file}")
        return jsonify([])
    
    routes_data = load_csv(routes_file)
    all_paths = []
    
    
    if not routes_data:
        print("WARNING: No routes data loaded!")
        return jsonify([])
    
    # Load trips, stop_times, and stops ONCE before the loop (performance optimization)
    print("Loading trips, stop_times, and stops data...")
    trips_data = load_csv(os.path.join(GTFS_DIR, 'trips.txt'))
    stop_times = load_csv(os.path.join(GTFS_DIR, 'stop_times.txt'))
    stops_data = load_csv(os.path.join(GTFS_DIR, 'stops.txt'))
    print(f"Loaded {len(trips_data)} trips, {len(stop_times)} stop_times, {len(stops_data)} stops")
    
    # Create lookup dictionaries for faster access
    stops_dict = {}
    for stop in stops_data:
        stop_id = stop.get('stop_id', '').strip() if stop.get('stop_id') else ''
        if stop_id:
            stops_dict[stop_id] = stop
    
    # Group stop_times by trip_id for faster lookup
    stop_times_by_trip = defaultdict(list)
    for st in stop_times:
        trip_id = st.get('trip_id', '').strip() if st.get('trip_id') else ''
        if trip_id:
            stop_times_by_trip[trip_id].append(st)
    
    for idx, route in enumerate(routes_data):
        # Try to get route_id - handle None, empty string, whitespace
        route_id_raw = route.get('route_id')
        
        if route_id_raw is None:
            print(f"ERROR: Route {idx}: route_id is None. Keys = {list(route.keys())}, Data = {route}")
            # Try alternative column names
            route_id = route.get('route_short_name') or route.get('Route ID') or route.get('id') or None
            if route_id:
                route_id = str(route_id).strip()
                print(f"WARNING: Route {idx}: Using alternative: '{route_id}'")
            else:
                continue
        else:
            route_id = str(route_id_raw).strip() if route_id_raw else None
        
        if not route_id:
            print(f"ERROR: Route {idx}: route_id is empty after strip. Raw = '{route_id_raw}', Keys = {list(route.keys())}")
            continue
        
        try:
            # Match trips - handle both exact match and stripped match
            route_trip_ids = set()
            for trip in trips_data:
                trip_route_id = trip.get('route_id', '').strip() if trip.get('route_id') else ''
                if trip_route_id == route_id:
                    trip_id = trip.get('trip_id', '').strip() if trip.get('trip_id') else ''
                    if trip_id:
                        route_trip_ids.add(trip_id)
            
            if not route_trip_ids:
                if idx < 3:  # Only print first 3 to avoid spam
                    print(f"  Route {route_id}: No trips found")
                continue
            
            # Get stop_times for these trip_ids using the pre-built dictionary
            route_stop_times = []
            for trip_id in route_trip_ids:
                if trip_id in stop_times_by_trip:
                    route_stop_times.extend(stop_times_by_trip[trip_id])
            
            if not route_stop_times:
                if idx < 3:  # Only print first 3 to avoid spam
                    print(f"  Route {route_id}: No stop times found")
                continue
            
            # Group by trip_id and get ordered stops
            trip_paths = {}
            for st in route_stop_times:
                trip_id = st.get('trip_id', '').strip() if st.get('trip_id') else ''
                if trip_id:
                if trip_id not in trip_paths:
                    trip_paths[trip_id] = []
                trip_paths[trip_id].append(st)
            
            # Sort each trip's stops by stop_sequence
            for trip_id in trip_paths:
                try:
                    trip_paths[trip_id].sort(key=lambda x: int(x.get('stop_sequence', 0) or 0))
                except (ValueError, TypeError):
                    # Skip trips with invalid stop_sequence
                    continue
            
            # Get the most representative trip
            if trip_paths:
                best_trip_id = max(trip_paths.keys(), key=lambda tid: len(trip_paths[tid]))
                ordered_stops = trip_paths[best_trip_id]
                
                # Build path coordinates
                path_coordinates = []
                
                for st in ordered_stops:
                    stop_id = st.get('stop_id', '').strip() if st.get('stop_id') else ''
                    if not stop_id:
                        continue
                    
                    # Find stop using pre-built dictionary
                    stop = stops_dict.get(stop_id)
                    
                    if stop:
                        try:
                            lat_str = stop.get('stop_lat', '0').strip()
                            lon_str = stop.get('stop_lon', '0').strip()
                            
                            if not lat_str or not lon_str:
                                continue
                                
                            lat = float(lat_str)
                            lon = float(lon_str)
                            
                            # Validate coordinates (reasonable ranges)
                            if -90 <= lat <= 90 and -180 <= lon <= 180 and (lat != 0 or lon != 0):
                                path_coordinates.append([lat, lon])
                            else:
                                print(f"  Route {route_id}, Stop {stop_id}: Invalid coordinates ({lat}, {lon})")
                        except (ValueError, TypeError) as e:
                            print(f"  Route {route_id}, Stop {stop_id}: Error parsing coordinates - {e}")
                            continue
                
                if len(path_coordinates) >= 2:
                    all_paths.append({
                        'route_id': route_id,
                        'route': route,
                        'coordinates': path_coordinates,
                        'total_stops': len(path_coordinates)
                    })
                    if idx < 5:  # Only print first 5 to avoid spam
                        print(f"  Route {route_id}: {len(path_coordinates)} coordinates")
                else:
                    if idx < 3:  # Only print first 3 to avoid spam
                        print(f"  Route {route_id}: Only {len(path_coordinates)} valid coordinates (need at least 2)")
        except Exception as e:
            import traceback
            print(f"Error processing route {route_id}: {e}")
            traceback.print_exc()
            continue
    
    print(f"Successfully processed {len(all_paths)} route paths out of {len(routes_data)} routes")
    return jsonify(all_paths)

@app.route('/api/routes/<route_id>/update', methods=['PUT'])
def update_route(route_id):
    """Update route details and stop sequence"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data or 'route_id' not in data:
            return jsonify({'error': 'Invalid request data'}), 400
        
        # Load routes data
        routes_data = load_csv(os.path.join(GTFS_DIR, 'routes.txt'))
        
        # Find and update route
        route_updated = False
        for route in routes_data:
            if route.get('route_id') == route_id:
                # Update route fields
                if 'route_short_name' in data:
                    route['route_short_name'] = data['route_short_name']
                if 'route_long_name' in data:
                    route['route_long_name'] = data['route_long_name']
                if 'route_color' in data:
                    route['route_color'] = data['route_color']
                if 'route_desc' in data:
                    route['route_desc'] = data['route_desc']
                route_updated = True
                break
        
        if not route_updated:
            return jsonify({'error': 'Route not found'}), 404
        
        # Save updated routes
        if routes_data:
            with open(os.path.join(GTFS_DIR, 'routes.txt'), 'w', encoding='utf-8', newline='') as f:
                fieldnames = routes_data[0].keys()
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(routes_data)
        
        # Update stop_times if stop sequence provided
        if 'stops' in data and data['stops']:
            trips_data = load_csv(os.path.join(GTFS_DIR, 'trips.txt'))
            stop_times_data = load_csv(os.path.join(GTFS_DIR, 'stop_times.txt'))
            
            # Get trip_ids for this route
            route_trip_ids = {trip['trip_id'] for trip in trips_data if trip.get('route_id') == route_id}
            
            # Update stop sequence for first trip (simplified - in production, might need more complex logic)
            if route_trip_ids:
                first_trip_id = next(iter(route_trip_ids))
                new_sequence = {stop['stop_id']: stop['stop_sequence'] for stop in data['stops']}
                
                # Update stop_times for this trip
                updated_count = 0
                for st in stop_times_data:
                    if st.get('trip_id') == first_trip_id:
                        stop_id = st.get('stop_id')
                        if stop_id in new_sequence:
                            st['stop_sequence'] = str(new_sequence[stop_id])
                            updated_count += 1
                
                # Save updated stop_times
                if stop_times_data:
                    with open(os.path.join(GTFS_DIR, 'stop_times.txt'), 'w', encoding='utf-8', newline='') as f:
                        fieldnames = stop_times_data[0].keys()
                        writer = csv.DictWriter(f, fieldnames=fieldnames)
                        writer.writeheader()
                        writer.writerows(stop_times_data)
        
        return jsonify({
            'success': True,
            'message': 'Route updated successfully',
            'route_id': route_id
        })
    
    except Exception as e:
        return jsonify({'error': f'Error updating route: {str(e)}'}), 500

@app.route('/upload')
def upload_page():
    """Serve GTFS upload page"""
    return send_from_directory('static', 'upload.html')

def parse_gtfs_to_db_rows(data_list, upload_id, table_type):
    """Convert CSV dict rows to database model row dictionaries"""
    rows = []
    standard_fields = {
        'routes': ['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_desc', 
                   'route_type', 'route_url', 'route_color', 'route_text_color'],
        'trips': ['trip_id', 'route_id', 'service_id', 'trip_headsign', 'trip_short_name', 
                  'direction_id', 'block_id', 'shape_id', 'wheelchair_accessible', 'bikes_allowed'],
        'stops': ['stop_id', 'stop_code', 'stop_name', 'stop_desc', 'stop_lat', 'stop_lon', 
                  'zone_id', 'stop_url', 'location_type', 'parent_station', 'stop_timezone', 'wheelchair_boarding'],
        'stop_times': ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 
                       'stop_headsign', 'pickup_type', 'drop_off_type', 'shape_dist_traveled', 'timepoint']
    }
    
    for row in data_list:
        standard = {}
        other = {}
        
        for key, value in row.items():
            # Convert empty strings to None
            if value == '' or value is None:
                value = None
            
            if key in standard_fields.get(table_type, []):
                standard[key] = value
            else:
                if value is not None:
                    other[key] = value
        
        # Convert types for specific fields
        if table_type == 'stops':
            if 'stop_lat' in standard and standard['stop_lat']:
                try:
                    standard['stop_lat'] = float(standard['stop_lat'])
                except:
                    standard['stop_lat'] = None
            if 'stop_lon' in standard and standard['stop_lon']:
                try:
                    standard['stop_lon'] = float(standard['stop_lon'])
                except:
                    standard['stop_lon'] = None
        
        if table_type == 'stop_times':
            if 'stop_sequence' in standard and standard['stop_sequence']:
                try:
                    standard['stop_sequence'] = int(standard['stop_sequence'])
                except:
                    standard['stop_sequence'] = None
            if 'shape_dist_traveled' in standard and standard['shape_dist_traveled']:
                try:
                    standard['shape_dist_traveled'] = float(standard['shape_dist_traveled'])
                except:
                    standard['shape_dist_traveled'] = None
        
        # Add upload_id and other_fields
        standard['upload_id'] = upload_id
        if other:
            standard['other_fields'] = json.dumps(other)
        else:
            standard['other_fields'] = None
        
        rows.append(standard)
    
    return rows

@app.route('/api/upload-gtfs', methods=['POST'])
def upload_gtfs():
    """Handle GTFS ZIP file upload, extraction, and database storage - OPTIMIZED"""
    import time
    start_time = time.time()
    print(f"[{time.strftime('%H:%M:%S')}] Upload started")
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Only ZIP files are allowed'}), 400
    
    dataset_name = request.form.get('name', file.filename)
    notes = request.form.get('notes', '')
    
    try:
        # Get file size
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        
        # Extract ZIP
        temp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(temp_dir, secure_filename(file.filename))
        file.save(zip_path)
        
        print(f"[{time.strftime('%H:%M:%S')}] Extracting files...")
        required_files = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']
        extracted_files = {}
        missing_files = []
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            file_list = zip_ref.namelist()
            for req_file in required_files:
                found = False
                for zip_file in file_list:
                    if zip_file.endswith(req_file):
                        zip_ref.extract(zip_file, temp_dir)
                        extracted_files[req_file] = os.path.join(temp_dir, zip_file)
                        found = True
                        break
                if not found:
                    missing_files.append(req_file)
            
        if missing_files:
            shutil.rmtree(temp_dir)
            return jsonify({'error': 'Missing required GTFS files', 'missing': missing_files}), 400
        
        # Quick row count (fast)
        print(f"[{time.strftime('%H:%M:%S')}] Counting rows...")
        stats = {}
        for file_name, file_path in extracted_files.items():
            count = sum(1 for _ in open(file_path, 'r', encoding='utf-8-sig')) - 1  # -1 for header
            stats[file_name] = max(0, count)
        
        routes_count = stats.get('routes.txt', 0)
        trips_count = stats.get('trips.txt', 0)
        stops_count = stats.get('stops.txt', 0)
        stop_times_count = stats.get('stop_times.txt', 0)
        
        # Create upload record first - use separate session
        try:
            with app.app_context():
                # Ensure tables exist
                try:
                    db.create_all()
                except:
                    pass
                
                upload = GTFSUpload(
                    name=dataset_name,
                    upload_date=datetime.now(timezone.utc).replace(tzinfo=None),
                    num_routes=routes_count,
                    num_trips=trips_count,
                    num_stops=stops_count,
                    num_stop_times=stop_times_count,
                    status='Processing',
                    notes=notes,
                    file_size=file_size
                )
                db.session.add(upload)
                db.session.commit()
                upload_id = upload.id
                db.session.close()
        except Exception as e:
            shutil.rmtree(temp_dir)
            print(f"Error creating upload record: {e}")
            return jsonify({'error': f'Database error: {str(e)}'}), 500
        
        # Copy files FIRST (fast - enables immediate use)
        print(f"[{time.strftime('%H:%M:%S')}] Copying files to active directory...")
        backup_dir = os.path.join(GTFS_DIR, 'backup_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
        if os.path.exists(os.path.join(GTFS_DIR, 'stops.txt')):
            os.makedirs(backup_dir, exist_ok=True)
            for backup_file in ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']:
                src = os.path.join(GTFS_DIR, backup_file)
                if os.path.exists(src):
                    shutil.copy2(src, backup_dir)
        
        for file_name, file_path in extracted_files.items():
            dest = os.path.join(GTFS_DIR, file_name)
            shutil.copy2(file_path, dest)
        
        # Set as active immediately
        global CURRENT_ACTIVE_UPLOAD_ID
        CURRENT_ACTIVE_UPLOAD_ID = upload_id
        
        # Store in database - use separate sessions to avoid locking
        print(f"[{time.strftime('%H:%M:%S')}] Storing in database...")
        
        # Store routes
        if routes_count > 0:
            routes_file = extracted_files.get('routes.txt')
            if routes_file:
                try:
                    print(f"  Storing {routes_count} routes...")
                    import time
                    max_retries = 5
                    for attempt in range(max_retries):
                        try:
                            with app.app_context():
                                route_rows = []
                                with open(routes_file, 'r', encoding='utf-8-sig') as f:
                                    reader = csv.DictReader(f)
                                    for row in reader:
                                        parsed = parse_gtfs_to_db_rows([row], upload_id, 'routes')[0]
                                        route_rows.append(parsed)
                                if route_rows:
                                    db.session.bulk_insert_mappings(Route, route_rows)
                                    db.session.commit()
                                    db.session.close()
                                print(f"  Stored {len(route_rows)} routes")
                                break
                        except Exception as e:
                            db.session.rollback()
                            if 'locked' in str(e).lower() and attempt < max_retries - 1:
                                time.sleep(0.2 * (attempt + 1))
                                continue
                            raise
                except Exception as e:
                    print(f"  Error storing routes: {e}")
        
        # Skip trips storage - too slow, files are sufficient
        print(f"  Skipping trips storage ({trips_count} trips - using files only for performance)")
        
        # Store stops
        if stops_count > 0:
            stops_file = extracted_files.get('stops.txt')
            if stops_file:
                try:
                    print(f"  Storing {stops_count} stops...")
                    import time
                    max_retries = 5
                    for attempt in range(max_retries):
                        try:
                            with app.app_context():
                                stop_rows = []
                                with open(stops_file, 'r', encoding='utf-8-sig') as f:
                                    reader = csv.DictReader(f)
                                    for row in reader:
                                        parsed = parse_gtfs_to_db_rows([row], upload_id, 'stops')[0]
                                        stop_rows.append(parsed)
                                if stop_rows:
                                    db.session.bulk_insert_mappings(Stop, stop_rows)
                                    db.session.commit()
                                    db.session.close()
                                print(f"  Stored {len(stop_rows)} stops")
                                break
                        except Exception as e:
                            db.session.rollback()
                            if 'locked' in str(e).lower() and attempt < max_retries - 1:
                                time.sleep(0.2 * (attempt + 1))
                                continue
                            raise
                except Exception as e:
                    print(f"  Error storing stops: {e}")
        
        # Update status
        import time
        max_retries = 5
        for attempt in range(max_retries):
            try:
                with app.app_context():
                    upload = GTFSUpload.query.get(upload_id)
                    if upload:
                        upload.status = 'Parsed'
                        db.session.commit()
                        db.session.close()
                    break
            except Exception as e:
                db.session.rollback()
                if 'locked' in str(e).lower() and attempt < max_retries - 1:
                    time.sleep(0.2 * (attempt + 1))
                    continue
                print(f"  Error updating status: {e}")
                break
        
        # Generate preview data (only first 5 rows of each file for display)
        print(f"[{time.strftime('%H:%M:%S')}] Generating preview data...")
        preview_data = {}
        columns = {}
        
        for file_name, file_path in extracted_files.items():
            try:
                # Read first row to get columns
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    first_row = next(reader, None)
                    if first_row:
                        columns[file_name] = list(first_row.keys())
                        
                        # Read first 5 rows for preview
                        preview_rows = [first_row]
                        for i, row in enumerate(reader):
                            if i >= 4:  # Already have first row, need 4 more
                                break
                            preview_rows.append(row)
                        preview_data[file_name] = preview_rows
            except Exception as e:
                print(f"  Error reading preview from {file_name}: {e}")
                preview_data[file_name] = []
                columns[file_name] = []
        
        # Cleanup
        shutil.rmtree(temp_dir)
        
        elapsed_time = time.time() - start_time
        print(f"[{time.strftime('%H:%M:%S')}] Upload completed in {elapsed_time:.2f} seconds")
        
        return jsonify({
            'success': True,
            'message': 'GTFS file uploaded successfully',
            'upload_id': upload_id,
            'stats': {
                'routes': routes_count,
                'trips': trips_count,
                'stops': stops_count,
                'stop_times': stop_times_count,
                'avg_stops_per_trip': round(stop_times_count / trips_count, 2) if trips_count > 0 else 0
            },
            'previews': preview_data,
            'columns': columns,
            'processing_time_seconds': round(elapsed_time, 2),
            'note': 'Trips and stop_times stored in files only for performance'
        })
    
    except zipfile.BadZipFile:
        return jsonify({'error': 'Invalid ZIP file'}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Error processing file: {str(e)}'}), 500

# Archive Management API Endpoints

@app.route('/api/gtfs-uploads', methods=['GET'])
def get_gtfs_uploads():
    """Get list of all GTFS uploads"""
    import time
    max_retries = 3
    for attempt in range(max_retries):
        try:
            with app.app_context():
                uploads = GTFSUpload.query.order_by(GTFSUpload.upload_date.desc()).all()
                result = [upload.to_dict() for upload in uploads]
                db.session.close()
                return jsonify(result)
        except Exception as e:
            if 'locked' in str(e).lower() and attempt < max_retries - 1:
                time.sleep(0.1 * (attempt + 1))
                continue
            print(f"Error loading uploads: {e}")
            return jsonify({'error': f'Error loading uploads: {str(e)}'}), 500

@app.route('/api/gtfs-uploads/<int:upload_id>', methods=['GET'])
def get_gtfs_upload(upload_id):
    """Get details for a specific upload"""
    import time
    max_retries = 3
    for attempt in range(max_retries):
        try:
            with app.app_context():
                upload = GTFSUpload.query.get_or_404(upload_id)
                result = upload.to_dict()
                db.session.close()
                return jsonify(result)
        except Exception as e:
            if 'locked' in str(e).lower() and attempt < max_retries - 1:
                time.sleep(0.1 * (attempt + 1))
                continue
            print(f"Error loading upload: {e}")
            return jsonify({'error': f'Error loading upload: {str(e)}'}), 500

@app.route('/api/gtfs-uploads/<int:upload_id>/reload', methods=['POST'])
def reload_gtfs_upload(upload_id):
    """Reload a dataset from archive (set as active)"""
    try:
        with app.app_context():
            upload = GTFSUpload.query.get_or_404(upload_id)
            
            # Export data from database to CSV files
            # Routes
            routes = Route.query.filter_by(upload_id=upload_id).all()
            if routes:
                routes_data = [r.to_dict() for r in routes]
                routes_data_clean = []
                for r in routes_data:
                    r_clean = {k: v for k, v in r.items() if k not in ['id', 'upload_id', 'other_fields']}
                    routes_data_clean.append(r_clean)
                
                with open(os.path.join(GTFS_DIR, 'routes.txt'), 'w', encoding='utf-8', newline='') as f:
                    if routes_data_clean:
                        fieldnames = routes_data_clean[0].keys()
                        writer = csv.DictWriter(f, fieldnames=fieldnames)
                        writer.writeheader()
                        writer.writerows(routes_data_clean)
            
            # Trips
            trips = Trip.query.filter_by(upload_id=upload_id).all()
            if trips:
                trips_data = [t.to_dict() for t in trips]
                trips_data_clean = []
                for t in trips_data:
                    t_clean = {k: v for k, v in t.items() if k not in ['id', 'upload_id', 'other_fields']}
                    trips_data_clean.append(t_clean)
                
                with open(os.path.join(GTFS_DIR, 'trips.txt'), 'w', encoding='utf-8', newline='') as f:
                    if trips_data_clean:
                        fieldnames = trips_data_clean[0].keys()
                        writer = csv.DictWriter(f, fieldnames=fieldnames)
                        writer.writeheader()
                        writer.writerows(trips_data_clean)
            
            # Stops
            stops = Stop.query.filter_by(upload_id=upload_id).all()
            if stops:
                stops_data = [s.to_dict() for s in stops]
                stops_data_clean = []
                for s in stops_data:
                    s_clean = {k: v for k, v in s.items() if k not in ['id', 'upload_id', 'other_fields']}
                    stops_data_clean.append(s_clean)
                
                with open(os.path.join(GTFS_DIR, 'stops.txt'), 'w', encoding='utf-8', newline='') as f:
                    if stops_data_clean:
                        fieldnames = stops_data_clean[0].keys()
                        writer = csv.DictWriter(f, fieldnames=fieldnames)
                        writer.writeheader()
                        writer.writerows(stops_data_clean)
            
            # Stop Times
            stop_times = StopTime.query.filter_by(upload_id=upload_id).all()
            if stop_times:
                stop_times_data = [st.to_dict() for st in stop_times]
                stop_times_data_clean = []
                for st in stop_times_data:
                    st_clean = {k: v for k, v in st.items() if k not in ['id', 'upload_id', 'other_fields']}
                    stop_times_data_clean.append(st_clean)
                
                with open(os.path.join(GTFS_DIR, 'stop_times.txt'), 'w', encoding='utf-8', newline='') as f:
                    if stop_times_data_clean:
                        fieldnames = stop_times_data_clean[0].keys()
                        writer = csv.DictWriter(f, fieldnames=fieldnames)
                        writer.writeheader()
                        writer.writerows(stop_times_data_clean)
            
            # Set as active
            global CURRENT_ACTIVE_UPLOAD_ID
            CURRENT_ACTIVE_UPLOAD_ID = upload_id
            
            return jsonify({
                'success': True,
                'message': f'Dataset "{upload.name}" reloaded successfully',
                'upload_id': upload_id
            })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Error reloading dataset: {str(e)}'}), 500

@app.route('/api/gtfs-uploads/<int:upload_id>', methods=['DELETE'])
def delete_gtfs_upload(upload_id):
    """Delete a GTFS upload and all associated data"""
    import time
    max_retries = 5
    for attempt in range(max_retries):
        try:
            with app.app_context():
                upload = GTFSUpload.query.get_or_404(upload_id)
                upload_name = upload.name
                
                # Delete upload (cascades to related records)
                db.session.delete(upload)
                db.session.commit()
                db.session.close()
                
                return jsonify({
                    'success': True,
                    'message': f'Dataset "{upload_name}" deleted successfully'
                })
        except Exception as e:
            db.session.rollback()
            if 'locked' in str(e).lower() and attempt < max_retries - 1:
                time.sleep(0.2 * (attempt + 1))
                continue
            print(f"Error deleting upload: {e}")
            return jsonify({'error': f'Error deleting dataset: {str(e)}'}), 500

if __name__ == '__main__':
    # Create database tables if they don't exist
    with app.app_context():
        db.create_all()
    
    print("Starting GTFS Dashboard Server...")
    print("Open your browser to: http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)

