import { Img } from "@react-email/components";
import { config } from "~/config/shelf.config";
import { SERVER_URL } from "~/utils/env";

export function LogoForEmail() {
  const { logoPath } = config;
  return (
    <div style={{ margin: "0 auto", display: "flex" }}>
      <Img
        src={`${SERVER_URL}${
          logoPath?.fullLogo ?? "/static/images/sda-logo-full.png"
        }`}
        alt="شعار هيئة تطوير المنطقة الشرقية"
        width="auto"
        height="40"
        style={{ marginRight: "6px", width: "auto", height: "40px" }}
      />
    </div>
  );
}
