import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "sonner";

function App() {
  return (
    <>
      <AppLayout />
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "!bg-card !text-card-foreground !border-border/50 !shadow-2xl !shadow-black/30 !rounded-xl",
        }}
      />
    </>
  );
}

export default App;
