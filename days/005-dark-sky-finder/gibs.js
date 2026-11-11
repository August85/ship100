// NASA GIBS: VIIRS Black Marble 2016 night lights, free and keyless, CORS-enabled.
import { PIXELS_PER_CELL } from "./sky.js";

const WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

export function gibsUrl(region) {
  const width = region.cols * PIXELS_PER_CELL, height = region.rows * PIXELS_PER_CELL;
  const q = new URLSearchParams({
    SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.3.0", LAYERS: "VIIRS_Black_Marble", STYLES: "",
    CRS: "EPSG:4326", // WMS 1.3.0 + EPSG:4326 wants lat,lon order
    BBOX: [region.south, region.west, region.north, region.east].map((v) => v.toFixed(5)).join(","),
    WIDTH: String(width), HEIGHT: String(height), FORMAT: "image/png", TIME: "2016-01-01",
  });
  return { url: `${WMS}?${q}`, width, height };
}

// Web-Mercator WMS endpoint for the "satellite night lights" map layer.
export const GIBS_WMS_3857 = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi";
