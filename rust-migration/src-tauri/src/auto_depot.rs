use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, path::PathBuf, sync::{Mutex, OnceLock}};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Preferences {
    #[serde(default = "enabled_default")]
    pub enabled: bool,
    #[serde(default)]
    pub configured: bool,
}
fn enabled_default() -> bool { false }
impl Default for Preferences {
    fn default() -> Self { Self { enabled: false, configured: false } }
}
fn path() -> PathBuf {
    crate::credentials::get_app_data_dir().join("auto-depot-v2.json")
}
pub fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64).unwrap_or(0)
}
type Store = BTreeMap<String, Preferences>;
fn store() -> &'static Mutex<Result<Store, String>> {
    static STORE: OnceLock<Mutex<Result<Store, String>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(match std::fs::read(path()) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Store::new()),
        Err(e) => Err(e.to_string()),
    }))
}
fn persist(values: &Store) -> Result<(), String> {
    let file = path();
    std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
    let temporary = file.with_extension("json.tmp");
    std::fs::write(&temporary, serde_json::to_vec(values).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(temporary, file).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn auto_depot_get(account: String, legacy: Option<Preferences>) -> Result<Preferences, String> {
    if account.is_empty() { return Err("Personagem ausente".into()); }
    let mut guard = store().lock().map_err(|e| e.to_string())?;
    let values = guard.as_mut().map_err(|e| e.clone())?;
    if let Some(p) = values.get(&account) { return Ok(p.clone()); }
    let _ = legacy; // Never migrate the previous implicit opt-in.
    let pref = Preferences::default();
    let mut next = values.clone(); next.insert(account, pref.clone());
    persist(&next)?; *values = next;
    Ok(pref)
}
#[tauri::command]
pub fn auto_depot_set(account: String, mut preferences: Preferences) -> Result<(), String> {
    if account.is_empty() { return Err("Personagem ausente".into()); }
    let mut guard = store().lock().map_err(|e| e.to_string())?;
    let values = guard.as_mut().map_err(|e| e.clone())?;
    preferences.configured |= values.get(&account).is_some_and(|p| p.configured);
    let mut next = values.clone(); next.insert(account, preferences);
    persist(&next)?; *values = next;
    Ok(())
}

#[derive(Debug, Clone, Default)]
pub struct AutoDepot {
    account: String,
    automation: Value,
    pokemons: BTreeMap<String, Value>,
    active_id: String,
    ready: bool,
    last_sale: Option<i64>,
}
fn id(value: &Value) -> String {
    value.as_str().map(str::to_owned).or_else(|| value.as_u64().map(|v| v.to_string())).unwrap_or_default()
}
impl AutoDepot {
    pub fn observe(&mut self, raw: &Value) {
        let m = raw.get("data").unwrap_or(raw);
        let t = raw["t"].as_str().or_else(|| m["t"].as_str()).unwrap_or("");
        if matches!(t, "reset" | "disconnected" | "telemetry_gap") { *self = Self::default(); return; }
        if !matches!(t, "welcome" | "estado") { return; }
        let p = m.get("estado").unwrap_or(m);
        if t == "welcome" || p["cheio"] == true {
            *self = Self::default();
            self.account = id(&p["id"]);
            self.ready = true;
        }
        if self.account.is_empty() { return; }
        if p.get("id").is_some() && id(&p["id"]) != self.account { *self = Self::default(); return; }
        if let Some(active) = p.get("activeId") { self.active_id = id(active); }
        if let Some(auto) = p.get("automation") {
            if let Some(fields) = auto.as_object() {
                if !self.automation.is_object() { self.automation = json!({}); }
                self.automation.as_object_mut().unwrap().extend(fields.clone());
                self.ready = true;
            } else { self.automation = Value::Null; self.ready = false; }
        }
        if let Some(list) = p["pokemons"].as_array() {
            self.pokemons = list.iter().map(|p| (id(&p["id"]), p.clone())).collect();
        }
        if let Some(list) = p["pkMud"].as_array() {
            for p in list {
                let entry = self.pokemons.entry(id(&p["id"])).or_insert_with(|| json!({}));
                if let (Some(old), Some(delta)) = (entry.as_object_mut(), p.as_object()) { old.extend(delta.clone()); }
            }
        }
        if let Some(list) = p["pkFora"].as_array() {
            for p in list { self.pokemons.remove(&id(p)); }
        }
    }
    pub fn next_command(&mut self, now: i64) -> Result<Option<Value>, String> {
        if !self.ready || self.account.is_empty() { return Ok(None); }
        let mut pref = auto_depot_get(self.account.clone(), None)?;
        let before = pref.clone();
        let command = self.command(now, &mut pref);
        if pref != before { auto_depot_set(self.account.clone(), pref)?; }
        Ok(command)
    }
    fn command(&mut self, now: i64, pref: &mut Preferences) -> Option<Value> {
        if !self.ready || !pref.enabled || self.last_sale.is_some_and(|t| now - t < 60000) { return None; }
        let numeric_id = |p: &Value| p["id"].as_u64().or_else(|| p["id"].as_str()?.parse::<u64>().ok())
            .filter(|id| *id > 0 && *id <= 9_007_199_254_740_991);
        let safe_level = |p: &Value| p["level"].as_f64().or_else(|| p["level"].as_str()?.parse::<f64>().ok())
            .is_some_and(|level| level >= 1.0 && level <= 100.0 && level.fract() == 0.0);
        let locked = self.automation["pokemonTravado"].as_array();
        let depot = |p: &&Value| p["slot"].is_null() && id(&p["id"]) != self.active_id
            && !locked.is_some_and(|ids| ids.iter().any(|v| id(v) == id(&p["id"])));
        if self.pokemons.values().filter(depot).any(|p| numeric_id(p).is_none()) { return None; }
        // The bulk endpoint sells the entire prefix. Never cross a protected ID.
        let boundary = self.pokemons.values().filter(depot).filter(|p| !safe_level(p)).filter_map(numeric_id).min().unwrap_or(u64::MAX);
        let max = self.pokemons.values().filter(depot).filter(|p| safe_level(p))
            .filter_map(numeric_id).filter(|id| *id < boundary).max()?;
        if max == 0 || max > 9_007_199_254_740_991 { return None; }
        self.last_sale = Some(now);
        Some(json!({"t":"shop.sellAllPokemons","ateId":max}))
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bulk_prefix_does_not_cross_trained_or_unknown_pokemon() {
        let mut d = AutoDepot::default();
        let mut p = Preferences { enabled:true, configured:false };
        d.observe(&json!({"t":"welcome","estado":{"id":1,"pokemons":[{"id":2,"level":100},{"id":3,"level":101},{"id":4,"level":20}]}}));
        assert_eq!(d.command(0,&mut p).unwrap()["ateId"],2);
        d.observe(&json!({"t":"estado","estado":{"pkFora":[2],"pkMud":[{"id":3,"hp":10}]}}));
        assert!(d.command(60000,&mut p).is_none());
        d.observe(&json!({"t":"estado","estado":{"pkFora":[3],"pkMud":[{"id":1}]}}));
        assert!(d.command(120000,&mut p).is_none());
    }
    #[test]
    fn high_level_team_collection_and_active_do_not_block_low_level_depot() {
        let mut d = AutoDepot::default();
        let mut p = Preferences { enabled:true, configured:false };
        d.observe(&json!({"t":"welcome","estado":{"id":1,"activeId":3,"automation":{"pokemonTravado":[2]},"pokemons":[
            {"id":1,"level":1107,"slot":0},{"id":2,"level":101},{"id":3,"level":1065},
            {"id":4,"level":40},{"id":5,"level":40}
        ]}}));
        assert_eq!(d.command(0,&mut p).unwrap()["ateId"],5);
        d.observe(&json!({"t":"estado","estado":{"automation":{"pokemonTravado":[]}}}));
        assert!(d.command(60000,&mut p).is_none());
    }
    #[test]
    fn explicit_toggle_rate_limit_and_disconnect() {
        assert!(!Preferences::default().enabled);
        let mut d = AutoDepot::default();
        d.observe(&json!({"t":"welcome","estado":{"id":1,"pokemons":[{"id":99,"level":100,"shiny":true},{"id":200,"level":100,"slot":0}]}}));
        let mut p = Preferences::default();
        assert!(d.command(0,&mut p).is_none());
        p.enabled = true;
        assert_eq!(d.command(0,&mut p).unwrap(),json!({"t":"shop.sellAllPokemons","ateId":99}));
        assert!(d.command(59999,&mut p).is_none());
        p.enabled = false; assert!(d.command(60000,&mut p).is_none());
        p.enabled = true; assert!(d.command(60000,&mut p).is_some());
        d.observe(&json!({"t":"disconnected"})); assert!(d.command(120000,&mut p).is_none());
    }
}
