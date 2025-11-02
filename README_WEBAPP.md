# GTFS Transit Dashboard - Web Application

A full-featured web application for visualizing GTFS transit data with interactive maps, KPI dashboards, and real-time analytics.

## 🚀 Features

- **Interactive Map** - View all transit stops on an interactive map using Leaflet.js
- **KPI Dashboard** - Real-time metrics including:
  - Total stops, routes, and trips
  - Average headway (time between departures)
  - Average trip duration
- **Route Filtering** - Filter stops by route
- **Stop Details** - Click any stop to see upcoming departures
- **Responsive Design** - Works on desktop, tablet, and mobile

## 📋 Prerequisites

- Python 3.7 or higher
- pip (Python package manager)

## 🛠️ Installation

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Ensure GTFS files are in the project directory:**
   - `stops.txt`
   - `routes.txt`
   - `trips.txt`
   - `stop_times.txt`
   - `calendar.txt`

## 🚀 Running the Application

1. **Start the Flask server:**
   ```bash
   python app.py
   ```

2. **Open your browser:**
   Navigate to: `http://localhost:5000`

The application will automatically:
- Load GTFS data
- Calculate KPIs
- Display stops on the map
- Set up interactive features

## 📁 Project Structure

```
GTFS/
├── app.py                    # Flask backend server
├── requirements.txt          # Python dependencies
├── static/
│   ├── index.html           # Main HTML page
│   ├── styles.css           # Styling
│   └── app.js               # Frontend JavaScript
├── stops.txt                # GTFS stops data
├── routes.txt               # GTFS routes data
├── trips.txt                # GTFS trips data
├── stop_times.txt           # GTFS stop times data
├── calendar.txt             # GTFS calendar data
└── README_WEBAPP.md       # This file
```

## 🔌 API Endpoints

The Flask backend provides the following REST API:

- `GET /api/stops` - Get all stops with coordinates
- `GET /api/routes` - Get all routes
- `GET /api/trips` - Get all trips
- `GET /api/stop_times` - Get all stop times with calculated seconds
- `GET /api/kpis` - Get calculated KPIs
- `GET /api/stops/<stop_id>/departures` - Get departures for a specific stop
- `GET /api/routes/<route_id>/stops` - Get all stops for a specific route

## 🎨 Customization

### Change Map Center
Edit `static/app.js` line 11:
```javascript
map.setView([43.6532, -79.3832], 12);  // [latitude, longitude, zoom]
```

### Modify Colors
Edit `static/styles.css` - colors are defined using CSS variables and gradients.

### Add More KPIs
1. Add calculation in `app.py` `/api/kpis` endpoint
2. Add KPI card in `static/index.html`
3. Update `static/app.js` to display the new KPI

## 🐛 Troubleshooting

### Port Already in Use
If port 5000 is busy, edit `app.py` line 120:
```python
app.run(debug=True, host='0.0.0.0', port=8080)  # Change port number
```

### GTFS Files Not Loading
- Ensure all GTFS `.txt` files are in the same directory as `app.py`
- Check file encoding (should be UTF-8)
- Verify CSV format matches GTFS specification

### Map Not Showing
- Check browser console for JavaScript errors
- Ensure internet connection (map tiles load from OpenStreetMap)
- Try a different browser

## 📝 Notes

- The application uses **static GTFS data** (schedules only)
- For real-time performance metrics, you'll need GTFS-rt data
- Large GTFS feeds (millions of stop_times) may slow down initial loading
- Map tiles are served by OpenStreetMap (requires internet)

## 🚀 Deployment

To deploy to production:

1. **Set production mode** in `app.py`:
   ```python
   app.run(debug=False, host='0.0.0.0', port=5000)
   ```

2. **Use a production WSGI server:**
   ```bash
   pip install gunicorn
   gunicorn -w 4 -b 0.0.0.0:5000 app:app
   ```

3. **Consider using environment variables** for configuration

## 📄 License

This project is open source and available for educational and commercial use.

## 🤝 Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

---

**Built with:** Flask, Leaflet.js, HTML5, CSS3, JavaScript

