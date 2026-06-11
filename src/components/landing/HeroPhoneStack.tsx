import handPhoto from "@/assets/hand-phone.jpg";
import activitiesEn from "@/assets/appstore/activities-en.png.asset.json";
import activitiesZh from "@/assets/appstore/activities-zh.png.asset.json";

type Lang = "en" | "zh";

export default function HeroPhoneStack({ lang }: { lang: Lang }) {
  const screenshot = lang === "zh" ? activitiesZh.url : activitiesEn.url;

  return (
    <div className="relative w-full max-w-[520px] mx-auto">
      <div className="relative aspect-[1024/1536]">
        <img
          src={handPhoto}
          alt=""
          className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
          draggable={false}
        />
        {/* Screen overlay — positioned over the phone's white screen area */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: "29.8%",
            top: "12.7%",
            width: "40.5%",
            height: "64%",
            borderRadius: "6% / 4%",
          }}
        >
          <img
            src={screenshot}
            alt="Runward app screen"
            className="w-full h-full object-cover object-top"
          />
        </div>
      </div>
    </div>
  );
}
