export const EBOLA_HEALTH_GUIDANCE = {
  earlySymptoms: [
    "Fever",
    "Severe headache",
    "Muscle and joint aches",
    "Weakness and fatigue",
    "Sore throat",
    "Loss of appetite",
  ],
  laterSymptoms: [
    "Nausea and vomiting",
    "Diarrhoea",
    "Abdominal pain",
    "Skin rash or red eyes",
    "Confusion or difficulty breathing",
    "Unexplained bleeding in some patients",
  ],
  lookAlikes: [
    {
      name: "Malaria",
      overlap: "Fever, headache, body aches, weakness and fatigue can look the same early on.",
    },
    {
      name: "Typhoid fever",
      overlap: "Fever, headache, weakness and abdominal or digestive symptoms can overlap.",
    },
    {
      name: "Meningitis",
      overlap: "Fever, severe headache, weakness and confusion can resemble Ebola symptoms.",
    },
    {
      name: "Shigellosis",
      overlap: "Fever, abdominal pain and diarrhoea can resemble Ebola's gastrointestinal phase.",
    },
    {
      name: "Marburg virus disease",
      overlap:
        "Another viral haemorrhagic fever that can cause a similar febrile and gastrointestinal illness.",
    },
  ],
  sources: [
    {
      label: "WHO Ebola disease fact sheet",
      url: "https://www.who.int/news-room/fact-sheets/detail/ebola-disease",
    },
    {
      label: "CDC signs and symptoms of Ebola disease",
      url: "https://www.cdc.gov/ebola/signs-symptoms/index.html",
    },
    {
      label: "WHO Africa Ebola disease guidance",
      url: "https://www.afro.who.int/health-topics/ebola-disease",
    },
  ],
};

function renderList(items) {
  return items.map((item) => `<li>${item}</li>`).join("");
}

export function renderEbolaHealthGuidance() {
  const lookAlikes = EBOLA_HEALTH_GUIDANCE.lookAlikes
    .map(
      ({ name, overlap }) => `
        <article class="look-alike-item">
          <h3>${name}</h3>
          <p>${overlap}</p>
        </article>`,
    )
    .join("");

  const sources = EBOLA_HEALTH_GUIDANCE.sources
    .map(
      ({ label, url }) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
    )
    .join(" · ");

  return `
    <dialog id="symptoms-dialog" class="analytics-dialog symptoms-dialog" aria-labelledby="symptoms-dialog-title">
      <div class="dialog-content">
        <header class="dialog-header">
          <div>
            <span class="dialog-badge">Clinical awareness</span>
            <h2 id="symptoms-dialog-title">Ebola symptoms and look-alike illnesses</h2>
          </div>
          <button type="button" class="dialog-close-btn" id="close-symptoms-modal" aria-label="Close symptoms dialog">✕</button>
        </header>

        <p class="symptoms-intro">Ebola often begins with common, nonspecific symptoms. Bleeding is not always present, especially early in the illness.</p>

        <div class="symptom-phase-grid">
          <section class="symptom-phase">
            <span class="symptom-phase-label">Early symptoms</span>
            <h3>Initial “dry” phase</h3>
            <ul>${renderList(EBOLA_HEALTH_GUIDANCE.earlySymptoms)}</ul>
          </section>
          <section class="symptom-phase later">
            <span class="symptom-phase-label">Later symptoms</span>
            <h3>Progressive “wet” phase</h3>
            <ul>${renderList(EBOLA_HEALTH_GUIDANCE.laterSymptoms)}</ul>
          </section>
        </div>

        <section class="look-alike-section" aria-labelledby="look-alike-title">
          <div class="look-alike-heading">
            <div>
              <span class="symptom-phase-label">Why confusion happens</span>
              <h3 id="look-alike-title">Diseases considered in the affected region</h3>
            </div>
            <span class="chart-tag">Differential diagnosis</span>
          </div>
          <div class="look-alike-grid">${lookAlikes}</div>
        </section>

        <aside class="medical-safety-note" role="note">
          <strong>Symptoms alone cannot diagnose Ebola.</strong>
          Exposure history and laboratory testing are essential. If compatible symptoms follow a possible exposure, avoid direct contact with bodily fluids and contact local health authorities or a healthcare facility immediately. Call ahead if possible and follow their instructions. Do not wait for bleeding.
        </aside>

        <div class="dialog-footer symptoms-footer">
          <span class="dialog-note">Sources: ${sources}</span>
          <button type="button" class="dialog-action-btn" id="symptoms-done-btn">Dismiss</button>
        </div>
      </div>
    </dialog>`;
}
