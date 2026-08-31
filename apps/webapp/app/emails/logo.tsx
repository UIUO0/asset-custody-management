import { Img } from "@react-email/components";
import { config } from "~/config/shelf.config";
import { SERVER_URL } from "~/utils/env";

export function LogoForEmail() {
  const { logoPath } = config;
  return (
    <div style={{ margin: "0 auto", display: "flex" }}>
      <Img
        src={`${SERVER_URL}${
          logoPath?.fullLogo ?? "/static/images/app-logo-full.png"
        }`}
        alt="شعار جهة حكومية"
        width="auto"
        height="40"
        style={{ marginRight: "6px", width: "auto", height: "40px" }}
      />
    </div>
  );
}
