# GTFS Map + KPI Dashboard (No-Code Solution)

This project provides a complete no-code solution for building a GTFS transit dashboard using Google Sheets and Glide Apps.

## 📁 Files in This Project

### Sample GTFS Data Files
- **stops.txt** - Transit stop locations with coordinates
- **routes.txt** - Route definitions (Main Street Express, Oak Avenue Local, University Line)
- **trips.txt** - Trip schedules linked to routes
- **stop_times.txt** - Detailed arrival/departure times for each trip
- **calendar.txt** - Service calendar (weekday, weekend, daily)

### Documentation
- **GOOGLE_SHEETS_FORMULAS.md** - Complete formula reference for all KPIs
- **README.md** - This file

## 🚀 Quick Start

### Option 1: Use Sample Data (Testing)

1. **Import to Google Sheets:**
   - Create a new Google Sheet
   - Import each `.txt` file as a separate sheet
   - Name sheets exactly: `Stops`, `Routes`, `Trips`, `StopTimes`, `Calendar`

2. **Add Time Conversion Formulas:**
   - See `GOOGLE_SHEETS_FORMULAS.md` Step 3
   - Add `arrival_sec` and `departure_sec` columns to StopTimes sheet

3. **Add Route ID to StopTimes:**
   - See `GOOGLE_SHEETS_FORMULAS.md` Step 4
   - Use INDEX/MATCH to link trip_id → route_id

4. **Calculate KPIs:**
   - Create a `KPIs` sheet
   - Use formulas from `GOOGLE_SHEETS_FORMULAS.md` Step 5

5. **Connect to Glide:**
   - Sign up at [glideapps.com](https://glideapps.com)
   - Create new app from Google Sheets
   - Add Map component (use stop_lat, stop_lon)
   - Add KPI cards and charts
   - Publish!

### Option 2: Use Real Transit Agency Data

1. **Download GTFS ZIP:**
   - Find your transit agency's GTFS feed
   - Common sources: city open data portals, agency websites
   - Search for "GTFS" or "transit schedule"

2. **Follow same steps as Option 1** using your downloaded files

## 📊 Available KPIs

Once formulas are applied, you'll have:

- **Total Unique Routes** - Count of distinct routes
- **Total Trips** - Count of scheduled trips
- **Average Headway** - Time between consecutive departures at a stop
- **Average Trip Duration** - Average scheduled trip length
- **On-Time Performance** - Requires GTFS-rt or AVL data (optional)

## 🗺️ Glide Dashboard Features

Your Glide dashboard will include:

1. **Interactive Map** - Shows all stops with markers
2. **Route Selector** - Filter by route_id
3. **Stop Details** - Click stop to see upcoming departures
4. **KPI Cards** - Dashboard metrics at a glance
5. **Charts** - Visualize headway, trip duration, etc.
6. **Date/Service Filters** - Filter by weekday/weekend

## 🔄 Automated Updates (Optional)

To keep data fresh without coding:

- **Make (Integromat)** - Automate GTFS download and Sheet updates
- **Zapier** - Similar automation workflow
- **Parabola** - Visual data flow builder

All support:
- Scheduled GTFS ZIP downloads
- CSV extraction and parsing
- Google Sheets updates

## 📚 Full Documentation

See `GOOGLE_SHEETS_FORMULAS.md` for:
- Complete formula reference
- Step-by-step KPI calculations
- Column mapping guide
- Troubleshooting tips

## 🎯 Next Steps

1. ✅ Import sample data to Google Sheets
2. ✅ Apply formulas from `GOOGLE_SHEETS_FORMULAS.md`
3. ✅ Build dashboard in Glide Apps
4. ✅ Test and customize
5. ✅ Publish and share!

## 📝 Notes

- **GTFS vs GTFS-rt:** Static GTFS = schedules only. For real-time performance, you need GTFS-rt or AVL data.
- **Large datasets:** Very large GTFS feeds (millions of stop_times) may slow Google Sheets. Consider sampling or a database for production.
- **Time parsing:** The provided formulas handle GTFS times >24:00 correctly (e.g., 25:10:00)

## 🤝 Need Help?

- GTFS spec: [gtfs.org](https://gtfs.org)
- Glide docs: [docs.glideapps.com](https://docs.glideapps.com)
- Google Sheets functions: [support.google.com/sheets](https://support.google.com/sheets)

---

**Ready to build? Start with the sample data files and follow the formulas guide!**

