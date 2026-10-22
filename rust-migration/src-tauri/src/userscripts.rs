use serde::Serialize;
use reqwest::{Client, Url};
use std::time::Duration;

const MAX_BYTES: usize = 2 * 1024 * 1024;
#[derive(Debug, Serialize)]
pub struct Response {
    pub ok: bool,
    pub status: u16,
    pub url: String,
    pub code: String,
    pub error: String,
}
fn failure(url: &str, status: u16, error: impl Into<String>) -> Response {
    Response { ok:false, status, url:url.into(), code:String::new(), error:error.into() }
}
fn validate(url: &Url, script: bool) -> Result<(), String> {
    if url.scheme() != "https" || !matches!(url.host_str(), Some("github.com" | "raw.githubusercontent.com"))
        || !url.username().is_empty() || url.password().is_some() || url.port().is_some_and(|p| p != 443) {
        return Err("Use um link HTTPS de github.com ou raw.githubusercontent.com.".into());
    }
    if script && !url.path().to_ascii_lowercase().ends_with(".js") {
        return Err("Abra o arquivo .js no GitHub e copie o link dele (não o link do repositório).".into());
    }
    Ok(())
}
pub fn normalize(input: &str, script: bool) -> Result<Url, String> {
    let mut url = Url::parse(input.trim()).map_err(|_| "Link inválido.".to_string())?;
    validate_host(&url)?;
    if url.host_str() == Some("github.com") {
        let parts: Vec<_> = url.path().split('/').filter(|p| !p.is_empty()).collect();
        if parts.len() >= 5 && matches!(parts[2], "blob" | "raw") {
            url = Url::parse(&format!("https://raw.githubusercontent.com/{}/{}/{}", parts[0], parts[1], parts[3..].join("/"))).map_err(|_| "Link inválido.".to_string())?;
        }
    }
    url.set_fragment(None);
    validate(&url, script)?;
    Ok(url)
}
fn validate_host(url: &Url) -> Result<(), String> { validate(url, false) }
fn content_ok(bytes: Vec<u8>, script: bool) -> Result<String, String> {
    if bytes.len() > MAX_BYTES { return Err("O arquivo passa de 2 MB.".into()); }
    let code = String::from_utf8(bytes).map_err(|_| "O arquivo não é texto UTF-8.".to_string())?;
    if script && (code.trim().is_empty() || code.trim_start_matches('\u{feff}').trim_start().starts_with('<')) {
        return Err("O link devolveu uma página HTML ou arquivo vazio, não um script JavaScript.".into());
    }
    Ok(code)
}
pub async fn fetch(input: &str, script: bool) -> Response {
    let mut url = match normalize(input, script) { Ok(u)=>u, Err(e)=>return failure(input,0,e) };
    let client = match Client::builder().user_agent(concat!("PIO-Rebosteio/",env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(15)).redirect(reqwest::redirect::Policy::none()).build() {
        Ok(c)=>c, Err(_)=>return failure(url.as_str(),0,"Não foi possível iniciar a conexão.")
    };
    // Validate every redirect, including relative locations. No remote arbitrary hosts.
    for hop in 0..=3 {
        let mut response = match client.get(url.clone()).header("Accept", "*/*").header("Cache-Control", "no-cache").send().await {
            Ok(r)=>r, Err(e)=>return failure(url.as_str(),0,if e.is_timeout(){"O GitHub demorou para responder. Tente novamente."}else{"Não foi possível acessar o GitHub. Verifique a conexão."})
        };
        let status=response.status().as_u16();
        if response.status().is_redirection() {
            if hop == 3 { return failure(url.as_str(),status,"Redirecionamentos demais."); }
            let next=response.headers().get("location").and_then(|v|v.to_str().ok()).and_then(|v|url.join(v).ok());
            url=match next.and_then(|u|normalize(u.as_str(),script).ok()) {
                Some(u)=>u, None=>return failure(url.as_str(),status,"Redirecionamento fora dos endereços permitidos do GitHub.")
            };
            continue;
        }
        if status != 200 { return failure(url.as_str(),status,format!("GitHub respondeu HTTP {}. Confira se o arquivo é público e o link está correto.",status)); }
        if response.content_length().is_some_and(|n|n > MAX_BYTES as u64) { return failure(url.as_str(),status,"O arquivo passa de 2 MB."); }
        let mut bytes=Vec::new();
        loop {
            match response.chunk().await {
                Ok(Some(chunk))=>{ if bytes.len()+chunk.len()>MAX_BYTES{return failure(url.as_str(),status,"O arquivo passa de 2 MB.");} bytes.extend_from_slice(&chunk); },
                Ok(None)=>break,
                Err(_)=>return failure(url.as_str(),status,"Falha ao ler a resposta do GitHub.")
            }
        }
        return match content_ok(bytes,script) {
            Ok(code)=>Response{ok:true,status,url:url.into(),code,error:String::new()},
            Err(e)=>failure(url.as_str(),status,e)
        };
    }
    failure(url.as_str(),0,"Não foi possível baixar o arquivo.")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "requires public GitHub network access; downloads only, never executes code"]
    async fn public_github_userscript_download() {
        let response=fetch("https://github.com/panicguy/Scripts-PIO/blob/main/auto-sniper.user.js",true).await;
        assert!(response.ok,"{}",response.error);
        assert_eq!(response.status,200);
        assert!(response.url.starts_with("https://raw.githubusercontent.com/panicguy/Scripts-PIO/"));
        assert!(response.code.contains("==UserScript=="));
        let extension=fetch("https://raw.githubusercontent.com/panicguy/Scripts-PIO/main/auto-sniper.user.js",false).await;
        assert!(extension.ok,"{}",extension.error);
        assert!(!extension.code.is_empty());
    }
    #[test] fn github_links_become_raw() {
        assert_eq!(normalize("https://github.com/author/repo/blob/main/folder/tool.user.js?raw=true#L1",true).unwrap().as_str(),"https://raw.githubusercontent.com/author/repo/main/folder/tool.user.js");
        assert_eq!(normalize("https://github.com/author/repo/raw/refs/heads/main/a.js",true).unwrap().as_str(),"https://raw.githubusercontent.com/author/repo/refs/heads/main/a.js");
        assert!(normalize("https://raw.githubusercontent.com/author/repo/main/a.js",true).is_ok());
    }
    #[test] fn rejects_invalid_hosts_credentials_and_non_scripts() {
        for u in ["http://github.com/a/b/a.js","https://github.com.evil.test/a.js","https://user:pass@github.com/a/b/a.js","https://github.com:444/a/b/a.js","https://example.com/a.js","https://github.com/a/b"] {assert!(normalize(u,true).is_err(),"{}",u);}
        assert!(normalize("https://raw.githubusercontent.com/a/b/main/info.json",false).is_ok());
    }
    #[test] fn rejects_html_empty_and_oversized_scripts() {
        assert!(content_ok(b"  <!doctype html>".to_vec(),true).is_err());
        assert!(content_ok(vec![],true).is_err());
        assert!(content_ok(vec![b'x';MAX_BYTES+1],true).is_err());
        assert!(content_ok(b"// ==UserScript==\nconsole.log('ok');".to_vec(),true).is_ok());
        let r=Response{ok:true,status:200,url:"https://raw.githubusercontent.com/a/b/main/a.js".into(),code:"test".into(),error:String::new()};
        let value=serde_json::to_value(r).unwrap();assert_eq!(value["ok"],true);assert_eq!(value["code"],"test");
    }
}
