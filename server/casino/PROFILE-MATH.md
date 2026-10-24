# Casino reel profiles

The administrator selects one supported reel profile per game. The persisted
`app_casino_settings.game_profiles` map applies to every player and is locked
alongside each paid wager. It contains profile identifiers, not an arbitrary
requested percentage. Future paid rounds use the new choice; pending payouts,
accepted request identifiers and already started bonuses keep their contract.

The former `profile` setting is retained for migration history but is no longer
used for new rounds. `SCHOOL_RTP_0` through `SCHOOL_RTP_100` were payout scaling
options for one adapter and did not control the other five engines. These names
are rejected by the new API. There is no payout scalar or result-dependent
reroll in the profile selection path.

## Four original Slotopol engines

Lucky Clover X3, Viking's Fun, Fruit Queen and Seven Hot use the immutable reel
maps already vendored from Slotopol commit
`2a6fd837feea1b52bbfd65035a7698d0c70e096a`. Profile RTP values are the upstream
published theoretical expectations for those reel maps and scanners. The ports
retain their original paytables. Runtime tests verify all 67 available reel maps
and the original golden grading cases. Administrator choices are limited to
profiles whose stated theoretical RTP does not exceed 100%.

## Sizzling and Book adapters

Their supplied browser paytables differ from Slotopol's corresponding scanners.
Consequently an upstream reel map's name is not presented as this adapter's RTP.
Both the original client reels and the additional pinned Slotopol strips are
graded with the existing adapter paytable. Their expected returns are calculated
by `reel-return.mjs`:

* A uniform stop on each reel determines all three visible symbols. Each reel's
  symbol probabilities and its distribution of visible scatters are enumerated.
* For each paying symbol and prefix length, the exact-prefix probability is the
  product of the matching symbol/wild probabilities, minus the all-wild prefix
  when applicable, times the probability that the next reel breaks the prefix.
* The visible-scatter distributions are convolved across independent reels.
  This preserves the dependence between the three symbols on an individual reel.
* Expected line wins and scatter wins use the unchanged displayed multipliers.
  Their sum divided by the total stake gives the adapter's theoretical return.

Sizzling's original profile is approximately 95.660402%. Its three additional
reel profiles return approximately 82.900480%, 84.764160% and 85.743977% with this
client's paytable. These are different strips, not reduced payouts for a matching
winning grid.

Book's original profile is approximately 95.089721% while the existing free-spin
feature is off. The feature switch is not changed by this update. When it is on,
the existing rule grants ten additional rounds without retriggers. The model
adds `P(trigger) × 10 × E(free round)`, averaging the nine uniformly selected
expanding symbols and their extra reel awards. Book profiles therefore report
the expectation for the currently enabled feature configuration. The existing
original-reel configuration with this bonus is approximately 108.716872% and is
explicitly flagged rather than offered as a standard administrator choice.
With free spins enabled, a new installation therefore defaults to the highest
supported profile below 100% (approximately 91.252440%). Existing accepted
bonuses retain their stored reel profile even if the current choice changes.

New Book round payouts include the selected denomination. A pre-update bonus
without profile metadata retains the original strips and its stored per-line
stake. New bonuses store their profile identifier and effective per-line stake.

## Validation

`test-casino-math.mjs` independently enumerates all 1,024 stop combinations of
small test strips and compares the model to the production scanners, including
all nine Book expanding symbols. Seeded sampling is a diagnostic cross-check,
not RTP certification. A positive payout can be smaller than the stake and is
therefore not necessarily a profitable spin.

The wallet suites run production transactions in isolated PGlite databases and
check profile changes, frozen bonuses, denomination payouts, request replays,
collection and player/manager ledger conservation. The admin suite checks real
HTTP authorization, concurrent SQL persistence and audit entries. None of these
tests uses production database credentials or live customer funds.
