interface IPhoneFrameProps {
  src: string;
  alt: string;
  className?: string;
}

const IPhoneFrame = ({ src, alt, className = "" }: IPhoneFrameProps) => (
  <div className={`relative inline-block ${className}`}>
    {/* Phone shell */}
    <div className="relative rounded-[2.5rem] bg-foreground p-[10px] shadow-2xl shadow-foreground/20">
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-foreground rounded-b-2xl z-20" />
      {/* Screen */}
      <div className="relative rounded-[2rem] overflow-hidden bg-background">
        <img src={src} alt={alt} className="w-full h-auto block" loading="lazy" />
      </div>
    </div>
    {/* Side button */}
    <div className="absolute right-[-2px] top-[100px] w-[3px] h-[40px] bg-foreground/80 rounded-r-sm" />
    <div className="absolute left-[-2px] top-[80px] w-[3px] h-[24px] bg-foreground/80 rounded-l-sm" />
    <div className="absolute left-[-2px] top-[115px] w-[3px] h-[40px] bg-foreground/80 rounded-l-sm" />
    <div className="absolute left-[-2px] top-[160px] w-[3px] h-[40px] bg-foreground/80 rounded-l-sm" />
  </div>
);

export default IPhoneFrame;
