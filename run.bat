@echo off
echo Starting GTFS Dashboard Web Application...
echo.
echo Installing dependencies...
pip install -r requirements.txt
echo.
echo Starting server...
echo Open your browser to: http://localhost:5000
echo.
python app.py
pause

