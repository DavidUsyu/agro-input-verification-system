const steps = [
  { number: '01', title: 'Find the product code', text: 'Use the code printed on the seed or fertilizer packaging.' },
  { number: '02', title: 'Check the record', text: 'The planned verification service will compare the code with stored product records.' },
  { number: '03', title: 'Understand the result', text: 'Review the recorded product details, expiry date and any flagged concerns.' },
];

export default function HomePage() {
  return (
    <main id="main">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Better information. Better planting decisions.</p>
          <h1>Know more about<br />what you <em>grow with.</em></h1>
          <p className="hero-description">A simpler way to check seed and fertilizer product records before you buy or plant.</p>
          <a className="button" href="#project">Explore the project <span aria-hidden="true">→</span></a>
          <p className="development-note">The platform is being built. Product verification and accounts are not available yet.</p>
        </div>
        <aside className="purpose-panel" aria-label="Project focus">
          <p className="eyebrow">From the package to the record</p>
          <div className="crop-symbol" aria-hidden="true">↟</div>
          <h2>Confidence starts<br />with information.</h2>
          <p>Product details. Batch information. Expiry dates. One place to check.</p>
          <div className="category-row"><span>Seeds</span><span>Fertilizers</span></div>
        </aside>
      </section>
      <section id="project" className="project-section" aria-labelledby="project-title">
        <div className="section-heading"><p className="eyebrow">The planned experience</p><h2 id="project-title">A check in three simple steps.</h2></div>
        <div className="steps-grid">{steps.map((step) => (
          <article className="step" key={step.number}><span className="step-number">{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>
        ))}</div>
        <p className="record-note">Code verification checks stored records. It cannot confirm the physical contents of a package, and a code that is not found does not by itself mean the product is counterfeit.</p>
      </section>
    </main>
  );
}
