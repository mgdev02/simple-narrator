use crate::types::WordTiming;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WordSyncState {
    pub active_index: i32,
    pub spoken_count: u32,
}

pub fn active_word_index(starts: &[u32], ends: &[u32], time_ms: u32) -> i32 {
    let len = starts.len().min(ends.len());
    if len == 0 {
        return -1;
    }

    for i in 0..len {
        if time_ms < ends[i] {
            return i as i32;
        }
    }

    (len - 1) as i32
}

pub fn spoken_word_count(starts: &[u32], ends: &[u32], time_ms: u32) -> u32 {
    let len = starts.len().min(ends.len());
    if len == 0 {
        return 0;
    }

    let active = active_word_index(starts, ends, time_ms);
    if active < 0 {
        return 0;
    }

    if time_ms >= ends[active as usize] {
        (active + 1) as u32
    } else {
        active as u32
    }
}

pub fn compute_word_sync_state(starts: &[u32], ends: &[u32], time_ms: u32) -> WordSyncState {
    let active_index = active_word_index(starts, ends, time_ms);
    let spoken_count = spoken_word_count(starts, ends, time_ms);
    WordSyncState {
        active_index,
        spoken_count,
    }
}

pub fn spoken_char_count(timings: &[WordTiming], time_ms: u32) -> u32 {
    if timings.is_empty() {
        return 0;
    }

    let mut chars = 0u32;
    for timing in timings {
        let word_len = timing.word.chars().count() as u32;
        if time_ms >= timing.end_ms {
            chars += word_len;
            continue;
        }
        if time_ms <= timing.start_ms {
            break;
        }
        let span = (timing.end_ms - timing.start_ms).max(1);
        let partial = (time_ms - timing.start_ms) as f64 / span as f64;
        chars += (partial * word_len as f64).floor() as u32;
        break;
    }

    chars
}

pub fn spoken_char_count_arrays(
    starts: &[u32],
    ends: &[u32],
    word_char_lens: &[u32],
    time_ms: u32,
) -> u32 {
    let len = starts
        .len()
        .min(ends.len())
        .min(word_char_lens.len());
    if len == 0 {
        return 0;
    }

    let mut chars = 0u32;
    for i in 0..len {
        let word_len = word_char_lens[i];
        if time_ms >= ends[i] {
            chars += word_len;
            continue;
        }
        if time_ms <= starts[i] {
            break;
        }
        let span = (ends[i] - starts[i]).max(1);
        let partial = (time_ms - starts[i]) as f64 / span as f64;
        chars += (partial * word_len as f64).floor() as u32;
        break;
    }

    chars
}
