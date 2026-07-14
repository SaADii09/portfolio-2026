import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Desktop } from "@/components/os/Desktop";

export default function Home() {
  return (
    <ThemeProvider>
      <Desktop />
    </ThemeProvider>
  );
}
