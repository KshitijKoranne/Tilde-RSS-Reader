/*! The macOS shell.
 *
 * The web build of Tilde has one server component — `api/feed.js` — and it
 * exists only because a browser is not allowed to request a third-party feed.
 * A native app has no such rule, so this shell replaces that function with
 * `fetch_document` below and the deployed proxy stops being part of the
 * picture entirely: the Mac app talks to the sources directly.
 *
 * Four commands is the whole surface. Everything else — parsing, sanitising,
 * storage, the entire interface — is the same TypeScript the website runs.
 */

use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Matches the cap in `api/feed.js`, so a feed that is too big on the web is
/// too big here as well.
const MAX_BYTES: usize = 5 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(20);
const USER_AGENT: &str = "Tilde/1.0 (macOS; +https://github.com/KshitijKoranne/Tilde-RSS-Reader)";
const ACCEPT: &str = "application/rss+xml, application/atom+xml, application/xml, \
                      text/xml;q=0.9, text/html;q=0.8, */*;q=0.5";

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(TIMEOUT)
            .redirect(reqwest::redirect::Policy::limited(6))
            .build()
            .expect("the client has no fallible configuration")
    })
}

/// The shape `src/lib/fetcher.ts` expects back from `__TILDE_NATIVE_FETCH__`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedDocument {
    text: String,
    /// URL after redirects — relative `<link>` hrefs resolve against this.
    final_url: String,
    content_type: String,
}

fn charset_of(content_type: &str) -> Option<String> {
    content_type
        .split(';')
        .skip(1)
        .filter_map(|part| part.split_once('='))
        .find(|(key, _)| key.trim().eq_ignore_ascii_case("charset"))
        .map(|(_, value)| value.trim().trim_matches('"').to_string())
}

/// `<?xml version="1.0" encoding="ISO-8859-1"?>` — plenty of older feeds
/// declare their encoding here and nowhere else.
fn charset_in_declaration(bytes: &[u8]) -> Option<String> {
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(256)]).to_lowercase();
    let start = head.find("encoding=")? + "encoding=".len();
    let rest = head[start..].trim_start();
    let quote = rest.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let end = rest[1..].find(quote)? + 1;
    Some(rest[1..end].to_string())
}

/// The proxy hands the browser bytes and lets it decode them as UTF-8. Here we
/// can do better: honour the declared charset, whichever way it was declared.
fn decode(bytes: &[u8], content_type: &str) -> String {
    let label = charset_of(content_type).or_else(|| charset_in_declaration(bytes));
    let encoding = label
        .and_then(|label| encoding_rs::Encoding::for_label(label.as_bytes()))
        .unwrap_or(encoding_rs::UTF_8);
    encoding.decode(bytes).0.into_owned()
}

fn is_web_url(url: &reqwest::Url) -> bool {
    matches!(url.scheme(), "http" | "https")
}

#[tauri::command]
async fn fetch_document(url: String) -> Result<FetchedDocument, String> {
    let target =
        reqwest::Url::parse(&url).map_err(|_| "That is not a valid address.".to_string())?;
    if !is_web_url(&target) {
        return Err("Only http and https addresses can be fetched.".into());
    }

    let response = client()
        .get(target)
        .header(reqwest::header::ACCEPT, ACCEPT)
        .header(reqwest::header::ACCEPT_LANGUAGE, "en")
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "The source took too long to answer.".to_string()
            } else {
                "Could not reach that source.".to_string()
            }
        })?;

    if !response.status().is_success() {
        return Err(format!("The source answered {}.", response.status()));
    }
    if response.content_length().unwrap_or(0) as usize > MAX_BYTES {
        return Err("That document is too large to fetch.".into());
    }

    let final_url = response.url().to_string();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();

    // Read in chunks rather than calling .bytes(): a server that omits
    // content-length should not be able to fill memory.
    let mut body: Vec<u8> = Vec::new();
    let mut response = response;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The source stopped part-way through.".to_string())?
    {
        if body.len() + chunk.len() > MAX_BYTES {
            return Err("That document is too large to fetch.".into());
        }
        body.extend_from_slice(&chunk);
    }

    Ok(FetchedDocument {
        text: decode(&body, &content_type),
        final_url,
        content_type,
    })
}

/// Saves an OPML export. On the web this is a blob download; a WKWebView has
/// nowhere to put one, so the app asks for a location instead.
/// Returns false when the user cancels, which is not an error.
#[tauri::command]
async fn save_text_file(app: AppHandle, name: String, contents: String) -> Result<bool, String> {
    let chosen = app
        .dialog()
        .file()
        .set_title("Export subscriptions")
        .set_file_name(&name)
        .add_filter("Feed list", &["opml", "xml"])
        .blocking_save_file();

    let Some(path) = chosen else { return Ok(false) };
    let path = path.into_path().map_err(|error| error.to_string())?;
    std::fs::write(path, contents).map_err(|error| error.to_string())?;
    Ok(true)
}

/// The other half: pick a file and hand back its text. Returns None on cancel.
#[tauri::command]
async fn pick_text_file(app: AppHandle) -> Result<Option<String>, String> {
    let chosen = app
        .dialog()
        .file()
        .set_title("Import subscriptions")
        .add_filter("Feed list", &["opml", "xml"])
        .blocking_pick_file();

    let Some(path) = chosen else { return Ok(None) };
    let path = path.into_path().map_err(|error| error.to_string())?;
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

/// Article links belong in the user's browser, not in this window — following
/// one in place would navigate the app away from itself.
///
/// The href comes from a feed, so it is untrusted: the scheme check here is the
/// same one `sanitize.ts` makes, repeated on the side that can actually launch
/// something.
#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let target =
        reqwest::Url::parse(&url).map_err(|_| "That is not a valid address.".to_string())?;
    if !is_web_url(&target) {
        return Err("Only http and https links can be opened.".into());
    }
    app.opener()
        .open_url(target.to_string(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_document,
            save_text_file,
            pick_text_file,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tilde");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_charset_from_a_content_type() {
        assert_eq!(
            charset_of("text/xml; charset=ISO-8859-1").as_deref(),
            Some("ISO-8859-1")
        );
        assert_eq!(charset_of("application/rss+xml"), None);
    }

    #[test]
    fn falls_back_to_the_xml_declaration() {
        let bytes = br#"<?xml version="1.0" encoding="windows-1252"?><rss/>"#;
        assert_eq!(
            charset_in_declaration(bytes).as_deref(),
            Some("windows-1252")
        );
    }

    #[test]
    fn decodes_latin_1_when_that_is_what_was_declared() {
        // 0xE9 is é in ISO-8859-1 and invalid on its own in UTF-8.
        let bytes = [b'c', b'a', b'f', 0xE9];
        assert_eq!(decode(&bytes, "text/xml; charset=ISO-8859-1"), "café");
    }

    /// Reaches the real network on purpose. `cargo test -- --ignored` is how
    /// you check that the Mac app can fetch a live feed with no proxy in the
    /// way — TLS, redirects and decoding all at once. Left out of the default
    /// run so the ordinary suite stays hermetic and offline.
    #[tokio::test]
    #[ignore]
    async fn fetches_a_live_feed_with_no_proxy() {
        let document = fetch_document("https://feeds.bbci.co.uk/news/rss.xml".into())
            .await
            .expect("the feed should be reachable");
        assert!(document.text.contains("<rss") || document.text.contains("<feed"));
        assert!(document.final_url.starts_with("https://"));
        assert!(document.content_type.contains("xml"));
    }

    #[tokio::test]
    #[ignore]
    async fn reports_a_dead_source_in_words_a_person_can_read() {
        let error = fetch_document("https://httpbin.org/status/404".into())
            .await
            .expect_err("a 404 is not a document");
        assert!(error.contains("404"), "{error}");
    }

    #[test]
    fn refuses_schemes_that_are_not_the_web() {
        let file = reqwest::Url::parse("file:///etc/passwd").unwrap();
        assert!(!is_web_url(&file));
        assert!(is_web_url(
            &reqwest::Url::parse("https://example.com").unwrap()
        ));
    }
}
