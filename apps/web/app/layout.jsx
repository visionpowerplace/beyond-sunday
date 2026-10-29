import './globals.css';

export const metadata = {
  title: 'Beyond Sunday',
  description: 'One sermon in, a week of content out — reviewed before anything goes public.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <a href="/" className="brand" style={{ textDecoration: 'none' }}>Beyond <span>Sunday</span></a>
            <span className="small muted">the editing desk for church media</span>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
