export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`html,body{background:transparent !important;background-image:none !important;}`}</style>
      {children}
    </>
  )
}
