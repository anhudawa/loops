import { parseGpx } from "./gpx";
import { parseTcx } from "./tcx";
import { parseFit } from "./fit";

export interface RouteData {
  name: string | null;
  coordinates: [number, number][];
  elevations: number[];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
}

export async function parseRouteFile(
  filename: string,
  content: string | ArrayBuffer
): Promise<RouteData> {
  const ext = filename.toLowerCase().split(".").pop();

  switch (ext) {
    case "gpx":
      if (typeof content !== "string") {
        throw new Error("GPX files must be read as text");
      }
      return parseGpx(content);

    case "tcx":
      if (typeof content !== "string") {
        throw new Error("TCX files must be read as text");
      }
      return parseTcx(content);

    case "fit":
      if (typeof content === "string") {
        throw new Error("FIT files must be read as binary");
      }
      return parseFit(content);

    default:
      throw new Error(
        `Unsupported file format: .${ext}. Supported formats: .gpx, .fit, .tcx`
      );
  }
}
