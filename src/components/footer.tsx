const Footer = () => {
  const upstreamURL = "https://github.com/ThaiDuongVu/pawverwatch";
  const authorURL = "https://www.tiktok.com/@wingnight_ow";
  const repoURL = "https://github.com/ElijahBitz/deadpaw";

  return (
    <footer className="footer mt-auto bg-body-tertiary">
      <br />
      <div className="container">
        <div className="row">
          <div className="col text-start">
            <p className="text-body-tertiary">
              Forked from <a href={upstreamURL} className="text-info text-decoration-none">pawverwatch</a> by <a href={authorURL} className="text-info text-decoration-none">@wingnight_ow</a>
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
