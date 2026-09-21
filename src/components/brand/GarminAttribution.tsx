/**
 * Garmin attribution block, required by the Garmin Connect Developer Program
 * branding rules for any view that shows Garmin data (via Terra).
 *
 * Renders the unaltered Garmin tag logo followed by the device model.
 * The logo is never animated, recoloured or used where no Garmin data exists.
 */
import garminTagBlack from "@/assets/brands/garmin-tag-black.png.asset.json";
import garminTagWhite from "@/assets/brands/garmin-tag-white.png.asset.json";

interface Props {
  /** Device model from Terra, e.g. "Forerunner 265". */
  deviceModel?: string | null;
  size?: "sm" | "md";
  className?: string;
}

const GarminAttribution = ({ deviceModel, size = "sm", className = "" }: Props) => {
  const h = size === "sm" ? "h-3" : "h-4";
  const textSize = size === "sm" ? "text-[9px]" : "text-[11px]";
  return (
    <span className={`inline-flex items-center gap-1.5 align-middle ${className}`}>
      {/* black tag on light backgrounds, white tag in dark mode */}
      <img src={garminTagBlack.url} alt="Garmin" className={`${h} w-auto dark:hidden`} />
      <img src={garminTagWhite.url} alt="Garmin" className={`${h} w-auto hidden dark:block`} />
      <span className={`${textSize} font-medium uppercase tracking-wide text-muted-foreground`}>
        {deviceModel && deviceModel.trim() ? deviceModel : "Garmin device"}
      </span>
    </span>
  );
};

export default GarminAttribution;
