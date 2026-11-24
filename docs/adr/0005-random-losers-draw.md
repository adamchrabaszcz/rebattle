# 0005. A random draw for every Losers bracket round

- Status: Accepted (other draws planned as options in #79)
- Date: 2026-10-10

## Context
rebattle was built for a wakeboard event with its own format: double elimination where riders who lose once in the Winners bracket get a second chance in the Losers bracket, and the top two of each bracket cross over into a Final 4. In that format the Losers bracket isn't a fixed tree: each round, the survivors and the riders who just dropped from the Winners bracket are drawn together at random.

## Decision
The Losers bracket is built in gated levels. Level L is the survivors of level L−1 plus everyone who dropped from Winners round L, shuffled. A level opens only when its whole roster is known (level 1 also waits for Winners round 2); an odd roster gives one random rider a bye. The draw uses `Math.random`, unseeded.

## Consequences
- The Losers bracket can't be planned or printed in advance; the bracket view and the replay show each round as it is drawn (the replay with a short name shuffle).
- The bracket view orders each Losers column by where its riders came from (`lbLayout`), because a random draw has no natural order.
- The draw is not repeatable, which is why the organiser's browser has to be the authority (0003).
- A rider can meet someone they already rode; that's accepted.
- The invariants hold for every draw and are tested: N−1 Winners heats, N−3 Losers heats, 2N in total, everyone placed once.
- #79 plans the draw as a setting at setup (reshuffle every round as the default, random drop-ins, a fixed bracket), with a stored seed (#28); that would supersede this record.
