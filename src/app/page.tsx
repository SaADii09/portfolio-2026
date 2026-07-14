import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Desktop } from "@/components/os/Desktop";
import { CustomCursor } from "@/components/os/CustomCursor";

export default function Home() {
  return (
    <ThemeProvider>
      <CustomCursor />
      <Desktop />
    </ThemeProvider>
  );
}
