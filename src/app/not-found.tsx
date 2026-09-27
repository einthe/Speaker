import Link from "next/link";
export default function NotFound() {
  return (
    <main className="container">
      <h1>Siden finnes ikke</h1>
      <Link href="/matches">Til kampoversikten</Link>
    </main>
  );
}
