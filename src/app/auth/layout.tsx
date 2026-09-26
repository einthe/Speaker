import { PaletteSelector } from "@/components/palette-selector";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="auth-form-wrap">{children}</div>
        <PaletteSelector />
      </section>
    </main>
  );
}
