"""
Database models and setup for GTFS uploads storage
"""
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone

db = SQLAlchemy()

class GTFSUpload(db.Model):
    """Main table to track GTFS uploads"""
    __tablename__ = 'gtfs_uploads'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    upload_date = db.Column(db.DateTime, nullable=False)
    num_routes = db.Column(db.Integer, default=0)
    num_trips = db.Column(db.Integer, default=0)
    num_stops = db.Column(db.Integer, default=0)
    num_stop_times = db.Column(db.Integer, default=0)
    status = db.Column(db.String(50), default='Parsed')  # Parsed, Error, Pending
    notes = db.Column(db.Text, nullable=True)
    file_size = db.Column(db.Integer, nullable=True)  # File size in bytes
    
    # Relationships
    routes = db.relationship('Route', backref='upload', lazy=True, cascade='all, delete-orphan')
    trips = db.relationship('Trip', backref='upload', lazy=True, cascade='all, delete-orphan')
    stops = db.relationship('Stop', backref='upload', lazy=True, cascade='all, delete-orphan')
    stop_times = db.relationship('StopTime', backref='upload', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'upload_date': self.upload_date.isoformat() if self.upload_date else None,
            'num_routes': self.num_routes,
            'num_trips': self.num_trips,
            'num_stops': self.num_stops,
            'num_stop_times': self.num_stop_times,
            'status': self.status,
            'notes': self.notes,
            'file_size': self.file_size
        }


class Route(db.Model):
    """Routes table with upload_id foreign key"""
    __tablename__ = 'routes'
    
    id = db.Column(db.Integer, primary_key=True)
    upload_id = db.Column(db.Integer, db.ForeignKey('gtfs_uploads.id'), nullable=False)
    route_id = db.Column(db.String(255), nullable=False)
    agency_id = db.Column(db.String(255), nullable=True)
    route_short_name = db.Column(db.String(100), nullable=True)
    route_long_name = db.Column(db.String(255), nullable=True)
    route_desc = db.Column(db.Text, nullable=True)
    route_type = db.Column(db.String(50), nullable=True)
    route_url = db.Column(db.String(500), nullable=True)
    route_color = db.Column(db.String(10), nullable=True)
    route_text_color = db.Column(db.String(10), nullable=True)
    
    # Store other fields as JSON
    other_fields = db.Column(db.Text, nullable=True)  # JSON string for additional fields
    
    def to_dict(self):
        import json
        result = {
            'id': self.id,
            'upload_id': self.upload_id,
            'route_id': self.route_id,
            'agency_id': self.agency_id,
            'route_short_name': self.route_short_name,
            'route_long_name': self.route_long_name,
            'route_desc': self.route_desc,
            'route_type': self.route_type,
            'route_url': self.route_url,
            'route_color': self.route_color,
            'route_text_color': self.route_text_color
        }
        if self.other_fields:
            try:
                other = json.loads(self.other_fields)
                result.update(other)
            except:
                pass
        return result


class Trip(db.Model):
    """Trips table with upload_id foreign key"""
    __tablename__ = 'trips'
    
    id = db.Column(db.Integer, primary_key=True)
    upload_id = db.Column(db.Integer, db.ForeignKey('gtfs_uploads.id'), nullable=False)
    trip_id = db.Column(db.String(255), nullable=False)
    route_id = db.Column(db.String(255), nullable=False)
    service_id = db.Column(db.String(255), nullable=True)
    trip_headsign = db.Column(db.String(255), nullable=True)
    trip_short_name = db.Column(db.String(100), nullable=True)
    direction_id = db.Column(db.String(10), nullable=True)
    block_id = db.Column(db.String(255), nullable=True)
    shape_id = db.Column(db.String(255), nullable=True)
    wheelchair_accessible = db.Column(db.String(10), nullable=True)
    bikes_allowed = db.Column(db.String(10), nullable=True)
    
    # Store other fields as JSON
    other_fields = db.Column(db.Text, nullable=True)
    
    def to_dict(self):
        import json
        result = {
            'id': self.id,
            'upload_id': self.upload_id,
            'trip_id': self.trip_id,
            'route_id': self.route_id,
            'service_id': self.service_id,
            'trip_headsign': self.trip_headsign,
            'trip_short_name': self.trip_short_name,
            'direction_id': self.direction_id,
            'block_id': self.block_id,
            'shape_id': self.shape_id,
            'wheelchair_accessible': self.wheelchair_accessible,
            'bikes_allowed': self.bikes_allowed
        }
        if self.other_fields:
            try:
                other = json.loads(self.other_fields)
                result.update(other)
            except:
                pass
        return result


class Stop(db.Model):
    """Stops table with upload_id foreign key"""
    __tablename__ = 'stops'
    
    id = db.Column(db.Integer, primary_key=True)
    upload_id = db.Column(db.Integer, db.ForeignKey('gtfs_uploads.id'), nullable=False)
    stop_id = db.Column(db.String(255), nullable=False)
    stop_code = db.Column(db.String(100), nullable=True)
    stop_name = db.Column(db.String(255), nullable=True)
    stop_desc = db.Column(db.Text, nullable=True)
    stop_lat = db.Column(db.Float, nullable=True)
    stop_lon = db.Column(db.Float, nullable=True)
    zone_id = db.Column(db.String(100), nullable=True)
    stop_url = db.Column(db.String(500), nullable=True)
    location_type = db.Column(db.String(10), nullable=True)
    parent_station = db.Column(db.String(255), nullable=True)
    stop_timezone = db.Column(db.String(100), nullable=True)
    wheelchair_boarding = db.Column(db.String(10), nullable=True)
    
    # Store other fields as JSON
    other_fields = db.Column(db.Text, nullable=True)
    
    def to_dict(self):
        import json
        result = {
            'id': self.id,
            'upload_id': self.upload_id,
            'stop_id': self.stop_id,
            'stop_code': self.stop_code,
            'stop_name': self.stop_name,
            'stop_desc': self.stop_desc,
            'stop_lat': self.stop_lat,
            'stop_lon': self.stop_lon,
            'zone_id': self.zone_id,
            'stop_url': self.stop_url,
            'location_type': self.location_type,
            'parent_station': self.parent_station,
            'stop_timezone': self.stop_timezone,
            'wheelchair_boarding': self.wheelchair_boarding
        }
        if self.other_fields:
            try:
                other = json.loads(self.other_fields)
                result.update(other)
            except:
                pass
        return result


class StopTime(db.Model):
    """Stop times table with upload_id foreign key"""
    __tablename__ = 'stop_times'
    
    id = db.Column(db.Integer, primary_key=True)
    upload_id = db.Column(db.Integer, db.ForeignKey('gtfs_uploads.id'), nullable=False)
    trip_id = db.Column(db.String(255), nullable=False)
    arrival_time = db.Column(db.String(50), nullable=True)
    departure_time = db.Column(db.String(50), nullable=True)
    stop_id = db.Column(db.String(255), nullable=False)
    stop_sequence = db.Column(db.Integer, nullable=True)
    stop_headsign = db.Column(db.String(255), nullable=True)
    pickup_type = db.Column(db.String(10), nullable=True)
    drop_off_type = db.Column(db.String(10), nullable=True)
    shape_dist_traveled = db.Column(db.Float, nullable=True)
    timepoint = db.Column(db.String(10), nullable=True)
    
    # Store other fields as JSON
    other_fields = db.Column(db.Text, nullable=True)
    
    def to_dict(self):
        import json
        result = {
            'id': self.id,
            'upload_id': self.upload_id,
            'trip_id': self.trip_id,
            'arrival_time': self.arrival_time,
            'departure_time': self.departure_time,
            'stop_id': self.stop_id,
            'stop_sequence': self.stop_sequence,
            'stop_headsign': self.stop_headsign,
            'pickup_type': self.pickup_type,
            'drop_off_type': self.drop_off_type,
            'shape_dist_traveled': self.shape_dist_traveled,
            'timepoint': self.timepoint
        }
        if self.other_fields:
            try:
                other = json.loads(self.other_fields)
                result.update(other)
            except:
                pass
        return result

