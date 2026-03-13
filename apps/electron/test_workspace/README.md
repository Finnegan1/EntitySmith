# Test Workspace

This folder contains sample datasets for testing the Knowledge Graph Creator.

## Files

- `cities.json` — Major world cities with population and continent data
- `programming-languages.json` — Popular programming languages with metadata
- `space-agencies.json` — Real space agencies and launch organizations
- `launch-sites.json` — Major orbital launch sites with operator references
- `launch-vehicles.json` — Active and retired launch vehicle families
- `orbital-missions.json` — Recent missions linked to agencies, vehicles, and sites

## Suggested links for RDF graphing

- `launch-sites.operator_agency_id` -> `space-agencies.agency_id`
- `launch-vehicles.operator_agency_id` -> `space-agencies.agency_id`
- `orbital-missions.mission_agency_id` -> `space-agencies.agency_id`
- `orbital-missions.vehicle_id` -> `launch-vehicles.vehicle_id`
- `orbital-missions.launch_site_id` -> `launch-sites.launch_site_id`
