export const metadata = {
  title: 'About — HelmerBot',
  description: 'About the project',
};

export default function AboutPage() {
  return (
    <section className="stack">
      <div className="panel prose">
        <h1 className="h1" style={{ marginBottom: 8 }}>About</h1>

        <p>
          I am an investor with &gt;15 years of professional experience just trying to figure stuff out.
          To that end, I occasionally send out lists of stuff I find interesting and very occasionally write
          something long form, under a nom de plume,&nbsp;
          <a className="btn-link" 
            href="https://strotw.substack.com/"
            target="_blank" rel="noreferrer">
           here
          </a>
          .
        </p>

        <p>
          Hamilton Helmer&apos;s writing has heavily influenced my perspective on analyzing businesses. I strongly
          recommend his book,&nbsp;
          <a className="btn-link"
             href="https://www.amazon.com/7-Powers-Foundations-Business-Strategy/dp/0998116319"
             target="_blank" rel="noreferrer">
            7 Powers: The Foundations of Business Strategy
          </a>
          &nbsp;and his interviews on Acquired (see&nbsp;
          <a className="btn-link"
             href="https://www.acquired.fm/episodes/7-powers-with-hamilton-helmer"
             target="_blank" rel="noreferrer">
            here
          </a>
          &nbsp;and&nbsp;
          <a className="btn-link"
             href="https://www.acquired.fm/episodes/interview-hamilton-helmer-chenyi-shi-on-how-to-build-an-aws-like-second-business"
             target="_blank" rel="noreferrer">
            here
          </a>
          ).
        </p>

        <p>
          HelmerBot was vibe coded with GPT in VS Code, uses Claude to create and maintain the company database,
          and uses GPT-5 to do the heavy lifting on the analysis. The web design was done by GPT-5 using prompts
          referencing the &quot;Bloomberg chillwave&quot; aesthetic.
        </p>

        <p>
          It&apos;s worth mentioning that this was built for pure amusement and I have no affiliation whatsoever
          with Helmer or Strategy Capital.
        </p>
      </div>
    </section>
  );
}
