const Footer = () => {
  const upstreamURL = "https://github.com/ThaiDuongVu/pawverwatch";
  const authorURL = "https://www.tiktok.com/@wingnight_ow";
  const repoURL = "https://github.com/ElijahBitz/deadpaw";
  const issuesURL = `${repoURL}/issues`;
  const githubURL = "https://github.com/ElijahBitz";
  const portfolioURL = "https://killyourjockey.de";

  return (
    <footer className="footer mt-auto bg-body-tertiary">
      <br />
      <div className="container">
        <div className="row">
          <div className="col text-start">
            <p className="text-body-tertiary">
              Forked from <a href={upstreamURL} className="text-info text-decoration-none">pawverwatch</a> by <a href={authorURL} className="text-info text-decoration-none">@wingnight_ow</a>
              <br />
              Deadpaw by <a href={githubURL} className="text-info text-decoration-none" target="_blank">ElijahBitz</a> (<a href={portfolioURL} className="text-info text-decoration-none" target="_blank">killyourjockey.de</a>).
              Found a bug? Please <a href={issuesURL} className="text-info text-decoration-none" target="_blank">open an issue on GitHub</a>.
            </p>
          </div>
          <div className="col text-end">
            <a href={repoURL} className="p-2" target="_blank" aria-label="GitHub"><i className="bi bi-github text-body-tertiary"></i></a>
          </div>
        </div>
      </div>
    </footer>
  )

}

export default Footer;
