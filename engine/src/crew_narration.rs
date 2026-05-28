use crate::factions::get_faction;
use crate::types::*;

impl CrewMember {
    pub(crate) fn display_name(&self) -> &'static str {
        match self {
            CrewMember::Enne => "Enne",
            CrewMember::TessalyVane => "Tessaly Vane",
            CrewMember::Renn => "Renn",
            CrewMember::TheListener => "The Listener",
            CrewMember::IceMonksAbbot => "The Abbot",
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum ChangeKind {
    FactionChanged,
    PoliticsChanged,
    StabilityDropped,
    LargeTimeGap,
}

pub(crate) fn stability_band(stability: f64) -> u8 {
    match stability {
        s if s < 0.25 => 0,
        s if s < 0.5 => 1,
        s if s < 0.75 => 2,
        _ => 3,
    }
}

fn detect_changes(
    prior: &FactionMemoryEntry,
    current_faction_id: &str,
    current_politics: PoliticalType,
    current_stability: f64,
    galaxy_year: u32,
) -> Vec<ChangeKind> {
    let mut changes = Vec::new();

    if prior.faction_id != current_faction_id {
        changes.push(ChangeKind::FactionChanged);
    }

    if prior.politics.is_some_and(|p| p != current_politics) {
        changes.push(ChangeKind::PoliticsChanged);
    }

    if let Some(old_band) = prior.stability_band {
        let new_band = stability_band(current_stability);
        if old_band >= 2 && new_band < old_band.saturating_sub(1) {
            changes.push(ChangeKind::StabilityDropped);
        }
    }

    if galaxy_year.saturating_sub(prior.galaxy_year) > 500 {
        changes.push(ChangeKind::LargeTimeGap);
    }

    changes
}

fn crew_for_change(change: ChangeKind) -> CrewMember {
    match change {
        ChangeKind::FactionChanged => CrewMember::TessalyVane,
        ChangeKind::PoliticsChanged => CrewMember::TessalyVane,
        ChangeKind::StabilityDropped => CrewMember::Renn,
        ChangeKind::LargeTimeGap => CrewMember::Enne,
    }
}

fn pick_variant<'a>(variants: &'a [&'a str], galaxy_year: u32, system_id: u32) -> &'a str {
    let seed = galaxy_year ^ system_id.wrapping_mul(0x9E3779B9);
    variants[seed as usize % variants.len()]
}

fn narration_line(member: CrewMember, text: &str) -> CrewNarrationLine {
    CrewNarrationLine {
        speaker: member.display_name().to_string(),
        text: text.to_string(),
    }
}

fn faction_changed_line(
    prior: &FactionMemoryEntry,
    galaxy_year: u32,
    system_id: u32,
) -> CrewNarrationLine {
    let old_name = get_faction(&prior.faction_id)
        .map(|f| f.name.as_str())
        .unwrap_or("someone");
    let years_ago = galaxy_year.saturating_sub(prior.galaxy_year);
    let templates = [
        "{name} held this system when we were last here. That was {years} years ago.",
        "New masters. {name} must have lost their grip while we were in transit.",
        "The docks have been repainted. {name}'s colors are gone.",
        "Power changed hands. {name} — I wonder if anyone remembers them.",
    ];
    let text = pick_variant(&templates, galaxy_year, system_id)
        .replace("{name}", old_name)
        .replace("{years}", &years_ago.to_string());
    narration_line(CrewMember::TessalyVane, &text)
}

fn politics_changed_line(
    prior: &FactionMemoryEntry,
    current_politics: PoliticalType,
    galaxy_year: u32,
    system_id: u32,
) -> CrewNarrationLine {
    let old_name = prior.politics.map(|p| p.display_name()).unwrap_or_default();
    let new_name = current_politics.display_name();
    let templates = [
        "They've moved to {new}. The old {old} order is gone.",
        "{new} now. I've seen this transition before — it rarely goes smoothly.",
        "The political landscape shifted. {new} governs where {old} once did.",
    ];
    let text = pick_variant(&templates, galaxy_year, system_id)
        .replace("{new}", new_name)
        .replace("{old}", old_name);
    narration_line(CrewMember::TessalyVane, &text)
}

fn stability_dropped_line(galaxy_year: u32, system_id: u32) -> CrewNarrationLine {
    let variants = [
        "Stability's collapsed since we left. Watch yourself.",
        "This place was holding together last time. Not anymore.",
        "I don't like the readings. This system is falling apart.",
        "Keep weapons hot. The order we knew here is gone.",
    ];
    narration_line(
        CrewMember::Renn,
        pick_variant(&variants, galaxy_year, system_id),
    )
}

fn large_time_gap_line(
    prior: &FactionMemoryEntry,
    galaxy_year: u32,
    system_id: u32,
) -> CrewNarrationLine {
    let years_ago = galaxy_year.saturating_sub(prior.galaxy_year);
    let templates = [
        "{years} years since we were last here. I wonder what they remember of us.",
        "We left {years} years ago, by their count. Generations have lived and died.",
        "Last time I looked at these stars from this angle, their calendar read {years} years less.",
        "The light we saw leaving this system last time hasn't even reached the next cluster.",
    ];
    let text =
        pick_variant(&templates, galaxy_year, system_id).replace("{years}", &years_ago.to_string());
    narration_line(CrewMember::Enne, &text)
}

fn generate_line(
    change: ChangeKind,
    prior: &FactionMemoryEntry,
    current_politics: PoliticalType,
    galaxy_year: u32,
    system_id: u32,
) -> CrewNarrationLine {
    match change {
        ChangeKind::FactionChanged => faction_changed_line(prior, galaxy_year, system_id),
        ChangeKind::PoliticsChanged => {
            politics_changed_line(prior, current_politics, galaxy_year, system_id)
        }
        ChangeKind::StabilityDropped => stability_dropped_line(galaxy_year, system_id),
        ChangeKind::LargeTimeGap => large_time_gap_line(prior, galaxy_year, system_id),
    }
}

pub fn crew_narration_lines(
    crew: &[CrewMember],
    prior_memory: Option<&FactionMemoryEntry>,
    current_faction_id: &str,
    current_politics: PoliticalType,
    current_stability: f64,
    galaxy_year: u32,
    system_id: u32,
) -> Vec<CrewNarrationLine> {
    let Some(prior) = prior_memory else {
        return Vec::new();
    };
    if crew.is_empty() {
        return Vec::new();
    }

    let changes = detect_changes(
        prior,
        current_faction_id,
        current_politics,
        current_stability,
        galaxy_year,
    );

    changes
        .iter()
        .filter(|change| crew.contains(&crew_for_change(**change)))
        .map(|change| generate_line(*change, prior, current_politics, galaxy_year, system_id))
        .take(2)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory(faction_id: &str, year: u32) -> FactionMemoryEntry {
        FactionMemoryEntry {
            faction_id: faction_id.to_string(),
            contesting_faction_id: None,
            galaxy_year: year,
            politics: Some(PoliticalType::Kindness),
            stability_band: Some(3),
        }
    }

    #[test]
    fn no_crew_produces_no_lines() {
        let prior = memory("faction-0", 1000);
        let lines = crew_narration_lines(
            &[],
            Some(&prior),
            "faction-1",
            PoliticalType::SilenceMandate,
            0.1,
            2000,
            5,
        );
        assert!(lines.is_empty());
    }

    #[test]
    fn faction_change_with_tessaly_produces_line() {
        let prior = memory("faction-0", 1000);
        let lines = crew_narration_lines(
            &[CrewMember::TessalyVane],
            Some(&prior),
            "faction-1",
            PoliticalType::Kindness,
            0.8,
            1200,
            5,
        );
        assert!(lines.iter().any(|l| l.speaker == "Tessaly Vane"));
    }

    #[test]
    fn stability_drop_without_renn_produces_no_line() {
        let prior = memory("faction-0", 1000);
        let lines = crew_narration_lines(
            &[CrewMember::Enne],
            Some(&prior),
            "faction-0",
            PoliticalType::Kindness,
            0.1,
            1200,
            5,
        );
        assert!(lines.iter().all(|l| l.speaker != "Renn"));
    }

    #[test]
    fn max_two_lines() {
        let prior = memory("faction-0", 500);
        let lines = crew_narration_lines(
            &[CrewMember::TessalyVane, CrewMember::Renn, CrewMember::Enne],
            Some(&prior),
            "faction-1",
            PoliticalType::SilenceMandate,
            0.1,
            2000,
            5,
        );
        assert!(lines.len() <= 2);
    }

    #[test]
    fn no_prior_memory_produces_no_lines() {
        let lines = crew_narration_lines(
            &[CrewMember::TessalyVane],
            None,
            "faction-0",
            PoliticalType::Kindness,
            0.8,
            2000,
            5,
        );
        assert!(lines.is_empty());
    }
}
