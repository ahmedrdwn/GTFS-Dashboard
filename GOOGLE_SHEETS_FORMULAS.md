# Google Sheets Formulas for GTFS Dashboard

This guide contains all the formulas you need to transform your GTFS data and calculate KPIs in Google Sheets.

## Step 3: Time Conversion Formulas

### Convert arrival_time to seconds (arrival_sec)

Place this formula in a new column (e.g., column E if arrival_time is in column D). Start at row 2:

```
=IF(D2="","",
  (VALUE(LEFT(D2, FIND(":", D2)-1)) * 3600)
  + (VALUE(MID(D2, FIND(":", D2)+1, 2)) * 60)
  + VALUE(RIGHT(D2, 2))
)
```

**For stop_times.txt:**
- If arrival_time is in column B: Replace D2 with B2
- Copy formula down for all rows

### Convert departure_time to seconds (departure_sec)

Same formula, but for departure_time column (typically column C):

```
=IF(C2="","",
  (VALUE(LEFT(C2, FIND(":", C2)-1)) * 3600)
  + (VALUE(MID(C2, FIND(":", C2)+1, 2)) * 60)
  + VALUE(RIGHT(C2, 2))
)
```

**Label columns:** Add headers "arrival_sec" and "departure_sec" to your new columns.

---

## Step 4: Add Route ID to StopTimes Sheet

To link StopTimes with Routes, add route_id to the StopTimes sheet:

### Method 1: Using INDEX/MATCH (recommended)

In StopTimes sheet, add a new column (e.g., column J) labeled "route_id". In J2:

```
=IF(A2="","", INDEX(Trips!$A$2:$A$1000, MATCH(A2, Trips!$C$2:$C$1000, 0)))
```

**Assumptions:**
- StopTimes!A2 = trip_id
- Trips!A2:A1000 = route_id column
- Trips!C2:C1000 = trip_id column

Adjust ranges to match your data size.

---

## Step 5: KPI Formulas

Create a new sheet called **"KPIs"** and use these formulas:

### KPI A: Total Unique Routes

```
=COUNTA(UNIQUE(Routes!A2:A))
```

Assumes route_id is in Routes!A2:A

### KPI B: Total Trips

```
=COUNTA(UNIQUE(Trips!C2:C))
```

Assumes trip_id is in Trips!C2:C

### KPI C: Average Headway per Route at a Stop

**Step 1:** Sort StopTimes data by:
- stop_id (ascending)
- route_id (ascending)  
- departure_sec (ascending)

**Step 2:** Add helper column "headway_sec" (e.g., column K). In K2:

```
=IF(AND(A2=A1, J2=J1), C2 - C1, "")
```

Where:
- A = stop_id
- C = departure_sec
- J = route_id

**Step 3:** Calculate average headway for specific route and stop:

```
=AVERAGEIFS(K:K, J:J, "R1", A:A, "101")
```

Replace "R1" and "101" with actual route_id and stop_id, or use cell references:
```
=AVERAGEIFS(K:K, J:J, $L$1, A:A, $M$1)
```
(Where L1 = route_id input, M1 = stop_id input)

### KPI D: Average Trip Duration

**Step 1:** Create a new sheet "TripDuration" with columns:
- Column A: trip_id
- Column B: duration_sec

**Step 2:** In TripDuration!B2, calculate duration:

```
=MAXIFS(StopTimes!E:E, StopTimes!A:A, A2) - MINIFS(StopTimes!D:D, StopTimes!A:A, A2)
```

Where:
- StopTimes!E = arrival_sec
- StopTimes!D = departure_sec  
- StopTimes!A = trip_id
- A2 = trip_id from TripDuration sheet

**Step 3:** Get list of unique trip_ids first:
- In TripDuration!A2, use: `=UNIQUE(StopTimes!A2:A)`
- Then copy duration formula down

**Step 4:** Calculate average duration in KPIs sheet:

```
=AVERAGE(TripDuration!B2:B)
```

### KPI E: On-Time Performance (requires GTFS-rt or AVL data)

**Prerequisites:** You need actual_arrival_time from GTFS-rt or AVL data.

**Step 1:** Convert actual_arrival_time to seconds (same formula as arrival_sec)

**Step 2:** Calculate lateness_sec:
```
=actual_arrival_sec - scheduled_arrival_sec
```

**Step 3:** Count on-time trips (±300 seconds / 5 minutes):

```
=COUNTIFS(LatenessRange, "<=300", LatenessRange, ">=-300") / COUNTA(LatenessRange)
```

Replace "LatenessRange" with your lateness_sec column range.

---

## Additional Helper Formulas

### Count Stops per Route

In a new column in Routes sheet:
```
=COUNTIF(StopTimes!J:J, A2)
```
(Where StopTimes!J = route_id, Routes!A = route_id)

### Count Trips per Route

```
=COUNTIF(Trips!A:A, A2)
```
(Where Trips!A = route_id)

---

## Tips

1. **Always start formulas at row 2** (row 1 is headers)
2. **Adjust ranges** to match your data size (e.g., $A$2:$A$10000)
3. **Use absolute references ($)** when copying formulas that reference other sheets
4. **Test formulas on small data first** before copying to entire columns
5. **Format result columns** appropriately (numbers, time, etc.)

---

## Column Reference Guide

### Stops Sheet
- A: stop_id
- D: stop_lat
- E: stop_lon
- C: stop_name

### Routes Sheet  
- A: route_id
- C: route_short_name
- D: route_long_name

### Trips Sheet
- A: route_id
- B: service_id
- C: trip_id
- D: direction_id

### StopTimes Sheet
- A: trip_id
- B: arrival_time
- C: departure_time
- D: stop_id
- E: arrival_sec (calculated)
- F: departure_sec (calculated)
- J: route_id (added via formula)

---

## Ready for Glide?

Once you have:
- ✅ All 5 sheets imported (Stops, Routes, Trips, StopTimes, Calendar)
- ✅ Time conversion columns added (arrival_sec, departure_sec)
- ✅ route_id added to StopTimes sheet
- ✅ KPIs calculated

You're ready to connect to Glide!

