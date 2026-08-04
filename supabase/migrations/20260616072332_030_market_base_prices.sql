-- 030_market_base_prices.sql
-- Seed base_prices with ALL game resources from INITIAL_MARKET.
-- The Cloudflare worker reads this to initialize prices for new resources.
-- New resources discovered via pressure pool are added with the closest tier's average price.

-- Defensive: server_market_state is created by 20260622141122_029_server_market.sql,
-- which sorts AFTER this file. The shadow DB used by
-- `db diff --linked --use-pg-schema` replays in alphabetical order, so
-- without this guard the UPDATE below errors. On linked staging/prod
-- the table exists and the UPDATE runs as the original migration
-- intended.
DO $seed_prices$
BEGIN
  IF to_regclass('server_market_state') IS NOT NULL THEN
    UPDATE server_market_state
    SET base_prices = '[
  {"resource":"iron","basePrice":5},
  {"resource":"copper","basePrice":8},
  {"resource":"coal","basePrice":3},
  {"resource":"oil","basePrice":12},
  {"resource":"sand","basePrice":2},
  {"resource":"lithium","basePrice":20},
  {"resource":"water","basePrice":1},
  {"resource":"rareEarth","basePrice":50},
  {"resource":"ironPlate","basePrice":15},
  {"resource":"copperWire","basePrice":20},
  {"resource":"plastic","basePrice":30},
  {"resource":"glass","basePrice":10},
  {"resource":"carbon","basePrice":18},
  {"resource":"gear","basePrice":55},
  {"resource":"circuit","basePrice":150},
  {"resource":"engine","basePrice":300},
  {"resource":"battery","basePrice":140},
  {"resource":"steel","basePrice":35},
  {"resource":"aiChip","basePrice":1200},
  {"resource":"robotics","basePrice":5000},
  {"resource":"quantumPart","basePrice":25000},
  {"resource":"advancedAlloy","basePrice":400},
  {"resource":"nanoMaterial","basePrice":50000},
  {"resource":"clay","basePrice":2},
  {"resource":"limestone","basePrice":3},
  {"resource":"gravel","basePrice":1},
  {"resource":"bauxite","basePrice":15},
  {"resource":"wolframite","basePrice":60},
  {"resource":"bricks","basePrice":8},
  {"resource":"concrete","basePrice":18},
  {"resource":"fertilizer","basePrice":14},
  {"resource":"fossilFuel","basePrice":40},
  {"resource":"silicon","basePrice":75},
  {"resource":"aluminium","basePrice":70},
  {"resource":"insecticide","basePrice":40},
  {"resource":"copperIngot","basePrice":55},
  {"resource":"titanium","basePrice":300},
  {"resource":"coolant","basePrice":18},
  {"resource":"fiberOptics","basePrice":70},
  {"resource":"solarCell","basePrice":150},
  {"resource":"electronics","basePrice":600},
  {"resource":"medicalTech","basePrice":1500},
  {"resource":"jewellery","basePrice":800},
  {"resource":"tungsten","basePrice":400},
  {"resource":"weapons","basePrice":500},
  {"resource":"scanDrone","basePrice":5000},
  {"resource":"artifactDetector","basePrice":12000},
  {"resource":"neuralNetwork","basePrice":3500},
  {"resource":"singularityCore","basePrice":150000},
  {"resource":"darkMatterCell","basePrice":160000},
  {"resource":"warpDrive","basePrice":180000},
  {"resource":"antimatter","basePrice":8000},
  {"resource":"chronoPart","basePrice":500000},
  {"resource":"plasmaCore","basePrice":8000},
  {"resource":"megaStructure","basePrice":5000},
  {"resource":"voidCrystal","basePrice":250000}
]'
WHERE id = 1;
  END IF;
END
$seed_prices$;
