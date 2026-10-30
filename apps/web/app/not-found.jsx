export default function NotFound() {
  return (
    <div className="narrow" style={{ marginTop: 48 }}>
      <h1>Not here</h1>
      <p className="sub">
        That page does not exist, or the sermon it pointed at has been deleted.
      </p>
      <a className="btn primary" href="/sundays">Back to Sundays</a>
    </div>
  );
}
