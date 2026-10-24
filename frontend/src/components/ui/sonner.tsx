import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-[#1e293b] group-[.toaster]:border-[#e3ebe6] group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-[#64748b]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
