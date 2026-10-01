// Guided stories. Grounding rule: captions only frame and connect. They state no number and no fact
// that the quoted, counsel-verified evidence of that step doesn't state. The quotes carry the claims
// and are rendered verbatim with links to the documents.
// test/stories.test.ts fails the build if any referenced entity or quote is missing from the published atlas.

import type { Mode } from "./store";

export interface StoryStep {
  title: string;
  caption: string;
  mode: Mode;
  /** Sites, companies, routes, money flows or rules to highlight; the camera frames the sites. */
  focus: string[];
  /** Verbatim evidence to show: entity id + index into its evidence[]. */
  quotes: { entity: string; ev: number }[];
  /** Entity to open in the inspector. */
  select?: string;
  /** Controls view: date to scrub to and whose rules to show. */
  date?: string;
  bloc?: "allies" | "cn" | "all";
}

export interface Story { id: string; title: string; dek: string; steps: StoryStep[] }

export const STORIES: Story[] = [
  {
    id: "euv",
    title: "The EUV chokepoint",
    dek: "How the most advanced chips depend on one company's machines, and that company on a handful of its own suppliers.",
    steps: [
      {
        title: "One optics supplier", mode: "network",
        caption: "Every lithography system ASML builds uses optics from Carl Zeiss SMT in Germany. ASML's annual report describes the relationship in exclusive terms on both sides.",
        focus: ["fac:zeiss-oberkochen", "flow:zeiss-oberkochen-to-asml-veldhoven", "fac:asml-veldhoven"],
        quotes: [{ entity: "co:zeiss", ev: 0 }], select: "flow:zeiss-oberkochen-to-asml-veldhoven",
      },
      {
        title: "The light source", mode: "network",
        caption: "EUV light is produced with a high-power laser. ASML, Zeiss and TRUMPF developed the technology together, and TRUMPF builds the laser amplifier.",
        focus: ["fac:trumpf-ditzingen", "flow:trumpf-to-asml", "fac:asml-veldhoven"],
        quotes: [{ entity: "flow:trumpf-to-asml", ev: 2 }, { entity: "co:trumpf", ev: 0 }], select: "flow:trumpf-to-asml",
      },
      {
        title: "One maker of EUV", mode: "network",
        caption: "ASML is headquartered in Veldhoven, in the Netherlands.",
        focus: ["fac:asml-veldhoven"],
        quotes: [{ entity: "co:asml", ev: 0 }, { entity: "co:asml", ev: 1 }], select: "fac:asml-veldhoven",
      },
      {
        title: "Into the leading-edge fabs", mode: "network",
        caption: "These routes are drawn dashed: they are inferred. TSMC's filings say which fabs run its most advanced processes, and ASML's say it is the only EUV maker. No document lists which machine went to which fab.",
        focus: ["flow:asml-euv-to-tsmc-fab18", "flow:asml-euv-to-tsmc-fab20", "fac:tsmc-fab18-tainan", "fac:tsmc-fab20-hsinchu"],
        quotes: [{ entity: "flow:asml-euv-to-tsmc-fab18", ev: 0 }], select: "flow:asml-euv-to-tsmc-fab18",
      },
      {
        title: "Who can't buy one", mode: "controls", date: "today", bloc: "allies",
        caption: "Dutch and US export rules decide where these machines may ship. The Netherlands requires a licence for advanced chipmaking equipment, and ASML notes its EUV sales were already restricted.",
        focus: ["ctl:nl-2023-09-advanced-sme-order", "ctl:us-ccl-3b001f-lithography"],
        quotes: [{ entity: "ctl:nl-2023-09-advanced-sme-order", ev: 0 }, { entity: "ctl:nl-2023-09-advanced-sme-order", ev: 4 }],
        select: "ctl:nl-2023-09-advanced-sme-order",
      },
    ],
  },
  {
    id: "abilene",
    title: "From quartz to a campus in Abilene",
    dek: "One documented link per stage, from a North Carolina quartz mine to GB200 racks in West Texas. Each step is a separate relationship in the documents; no filing traces a single chip end to end.",
    steps: [
      {
        title: "Quartz", mode: "network",
        caption: "The chain starts in Spruce Pine, North Carolina, home to the high-purity quartz producers the US Geological Survey identifies.",
        focus: ["fac:sibelco-spruce-pine", "fac:the-quartz-corp-spruce-pine"],
        quotes: [{ entity: "fac:sibelco-spruce-pine", ev: 2 }, { entity: "fac:sibelco-spruce-pine", ev: 4 }], select: "fac:sibelco-spruce-pine",
      },
      {
        title: "Polysilicon to wafers", mode: "network",
        caption: "Wafer makers start from polysilicon. Siltronic names its main source.",
        focus: ["fac:wacker-burghausen", "fac:siltronic-burghausen", "flow:wacker-to-siltronic-polysilicon"],
        quotes: [{ entity: "flow:wacker-to-siltronic-polysilicon", ev: 0 }], select: "flow:wacker-to-siltronic-polysilicon",
      },
      {
        title: "Lithography", mode: "network",
        caption: "Next comes lithography.",
        focus: ["fac:asml-veldhoven"],
        quotes: [{ entity: "co:asml", ev: 1 }], select: "fac:asml-veldhoven",
      },
      {
        title: "Blackwell made in Arizona", mode: "network",
        caption: "NVIDIA has its chips made by foundries, including TSMC. Blackwell production has started at TSMC in Phoenix.",
        focus: ["fac:tsmc-fab21-arizona-p1", "flow:tsmc-arizona-nvidia-blackwell-wafers", "fac:nvidia-santa-clara-hq"],
        quotes: [{ entity: "flow:tsmc-nvidia-cowos", ev: 0 }, { entity: "flow:tsmc-arizona-nvidia-blackwell-wafers", ev: 0 }], select: "flow:tsmc-arizona-nvidia-blackwell-wafers",
      },
      {
        title: "Memory and packaging", mode: "network",
        caption: "TSMC and SK hynix document their work integrating HBM memory with TSMC's CoWoS packaging, and TSMC has contracted packaging and test from Amkor in Arizona.",
        focus: ["flow:sk-hynix-hbm-to-tsmc-cowos", "flow:tsmc-arizona-to-amkor-peoria"],
        quotes: [{ entity: "flow:sk-hynix-hbm-to-tsmc-cowos", ev: 0 }, { entity: "flow:tsmc-arizona-to-amkor-peoria", ev: 0 }],
        select: "flow:tsmc-arizona-to-amkor-peoria",
      },
      {
        title: "Servers in Texas", mode: "network",
        caption: "NVIDIA has named its Texas manufacturing partners.",
        focus: ["fac:foxconn-houston", "flow:nvidia-to-foxconn-houston"],
        quotes: [{ entity: "flow:nvidia-to-foxconn-houston", ev: 0 }], select: "fac:foxconn-houston",
      },
      {
        title: "The campus", mode: "network",
        caption: "Crusoe is building the Abilene campus, and Oracle has begun delivering GB200 racks. A state air permit covers onsite generation for the data centers.",
        focus: ["fac:crusoe-abilene", "flow:oracle-oci-racks-to-stargate-abilene", "fac:crusoe-abilene-longhorn-turbines"],
        quotes: [{ entity: "fac:crusoe-abilene", ev: 0 }, { entity: "flow:oracle-oci-racks-to-stargate-abilene", ev: 0 }, { entity: "fac:crusoe-abilene-longhorn-turbines", ev: 1 }],
        select: "fac:crusoe-abilene",
      },
    ],
  },
  {
    id: "capital",
    title: "Who pays for the buildout",
    dek: "The largest documented commitments behind AI compute, read from the filings that disclose them.",
    steps: [
      {
        title: "Contracted cloud backlog", mode: "capital",
        caption: "Oracle reports how much revenue it is contracted to deliver in the future. Its filings do not name the customers.",
        focus: ["fin:oracle-rpo"], quotes: [{ entity: "fin:oracle-rpo", ev: 0 }], select: "fin:oracle-rpo",
      },
      {
        title: "OpenAI and Azure", mode: "capital",
        caption: "Microsoft disclosed a new compute commitment from OpenAI as part of their restructured agreement.",
        focus: ["fin:openai-azure-incremental-250b", "fin:microsoft-openai-equity"],
        quotes: [{ entity: "fin:openai-azure-incremental-250b", ev: 0 }, { entity: "fin:microsoft-openai-equity", ev: 0 }],
        select: "fin:openai-azure-incremental-250b",
      },
      {
        title: "NVIDIA's supply commitments", mode: "capital",
        caption: "NVIDIA reports its total commitments to suppliers. The filing does not split them by supplier, so the atlas draws them as flagged links to the suppliers NVIDIA names elsewhere.",
        focus: ["fin:nvidia-supply-commitments-tsmc", "fin:nvidia-supply-commitments-sk-hynix", "fin:nvidia-supply-commitments-micron", "fin:nvidia-supply-commitments-samsung"],
        quotes: [{ entity: "fin:nvidia-supply-commitments-tsmc", ev: 0 }], select: "fin:nvidia-supply-commitments-tsmc",
      },
      {
        title: "Financing a campus off balance sheet", mode: "capital",
        caption: "Meta's Hyperion campus in Louisiana is being developed through a joint venture with funds managed by Blue Owl.",
        focus: ["fin:blue-owl-meta-hyperion-jv", "fac:meta-hyperion-richland-parish"],
        quotes: [{ entity: "fin:blue-owl-meta-hyperion-jv", ev: 0 }], select: "fin:blue-owl-meta-hyperion-jv",
      },
      {
        title: "Public money", mode: "capital",
        caption: "CHIPS Act awards fund chip manufacturing in the United States. In 2025 the government also took an equity stake in Intel.",
        focus: ["fin:chips-tsmc-arizona-grant", "fin:chips-intel-grant", "fin:doc-intel-equity-2025", "fin:chips-samsung-grant", "fin:chips-micron-grant-id-ny"],
        quotes: [{ entity: "fin:chips-intel-grant", ev: 0 }, { entity: "fin:doc-intel-equity-2025", ev: 0 }], select: "fin:doc-intel-equity-2025",
      },
    ],
  },
  {
    id: "power",
    title: "Powering the campuses",
    dek: "Nuclear restarts, new gas plants and onsite turbines: how documented AI campuses are getting electricity.",
    steps: [
      {
        title: "A nuclear plant next door", mode: "network",
        caption: "Talen and Amazon expanded a long-term agreement for power from the Susquehanna nuclear plant in Pennsylvania.",
        focus: ["fac:talen-susquehanna", "flow:susquehanna-to-amazon"],
        quotes: [{ entity: "flow:susquehanna-to-amazon", ev: 0 }], select: "flow:susquehanna-to-amazon",
      },
      {
        title: "Restarting Three Mile Island Unit 1", mode: "network",
        caption: "Constellation signed a long-term agreement with Microsoft tied to restarting the former TMI Unit 1, now the Crane Clean Energy Center, backed by a federal loan.",
        focus: ["fac:constellation-crane", "flow:crane-to-microsoft"],
        quotes: [{ entity: "flow:crane-to-microsoft", ev: 0 }, { entity: "fac:constellation-crane", ev: 0 }], select: "fac:constellation-crane",
      },
      {
        title: "New gas plants for Hyperion", mode: "network",
        caption: "Louisiana regulators are reviewing and approving new gas generation in Richland Parish, where Hyperion is being built.",
        focus: ["fac:entergy-franklin-farms", "fac:entergy-richland-parish-units-1-4", "fac:meta-hyperion-richland-parish"],
        quotes: [{ entity: "fac:entergy-franklin-farms", ev: 1 }, { entity: "fac:entergy-richland-parish-units-1-4", ev: 0 }],
        select: "fac:entergy-franklin-farms",
      },
      {
        title: "Turbines on site", mode: "network",
        caption: "Some campuses generate their own power. In Memphis the evidence is an appeal of an air permit. In Abilene it is the permit application itself.",
        focus: ["fac:xai-colossus-turbines-memphis", "fac:crusoe-abilene-longhorn-turbines"],
        quotes: [{ entity: "fac:xai-colossus-turbines-memphis", ev: 0 }, { entity: "fac:crusoe-abilene-longhorn-turbines", ev: 1 }],
        select: "fac:xai-colossus-turbines-memphis",
      },
    ],
  },
  {
    id: "controls",
    title: "The export-control wall",
    dek: "How US rules on chips and chipmaking tools tightened step by step, and how China answered with controls on critical minerals.",
    steps: [
      {
        title: "Huawei on the Entity List", mode: "controls", date: "2019-06-01", bloc: "allies",
        caption: "In 2019, the Commerce Department's Bureau of Industry and Security (BIS) added Huawei to the Entity List.",
        focus: ["ctl:us-bis-2019-huawei-entity-list"], quotes: [{ entity: "ctl:us-bis-2019-huawei-entity-list", ev: 0 }],
        select: "ctl:us-bis-2019-huawei-entity-list",
      },
      {
        title: "SMIC", mode: "controls", date: "2021-01-15", bloc: "allies",
        caption: "SMIC followed in December 2020.",
        focus: ["ctl:us-bis-2020-12-smic-entity-list"], quotes: [{ entity: "ctl:us-bis-2020-12-smic-entity-list", ev: 0 }],
        select: "ctl:us-bis-2020-12-smic-entity-list",
      },
      {
        title: "October 2022: advanced computing", mode: "controls", date: "2022-11-01", bloc: "allies",
        caption: "The October 2022 rule introduced controls on advanced computing chips and chipmaking equipment.",
        focus: ["ctl:us-bis-2022-10-advanced-computing-sme"], quotes: [{ entity: "ctl:us-bis-2022-10-advanced-computing-sme", ev: 0 }],
        select: "ctl:us-bis-2022-10-advanced-computing-sme",
      },
      {
        title: "China answers with minerals", mode: "controls", date: "2023-09-01", bloc: "cn",
        caption: "China's commerce ministry placed gallium and germanium items under export control.",
        focus: ["ctl:cn-mofcom-2023-23-gallium-germanium"], quotes: [{ entity: "ctl:cn-mofcom-2023-23-gallium-germanium", ev: 0 }],
        select: "ctl:cn-mofcom-2023-23-gallium-germanium",
      },
      {
        title: "October 2023: thresholds revised", mode: "controls", date: "2023-12-01", bloc: "allies",
        caption: "BIS revised the chip performance thresholds.",
        focus: ["ctl:us-bis-2023-10-advanced-computing"], quotes: [{ entity: "ctl:us-bis-2023-10-advanced-computing", ev: 0 }],
        select: "ctl:us-bis-2023-10-advanced-computing",
      },
      {
        title: "December 2024: memory and tools", mode: "controls", date: "2025-01-01", bloc: "allies",
        caption: "More chipmaking equipment came under control, along with new foreign-direct-product rules.",
        focus: ["ctl:us-bis-2024-12-fdp-hbm-sme"], quotes: [{ entity: "ctl:us-bis-2024-12-fdp-hbm-sme", ev: 0 }],
        select: "ctl:us-bis-2024-12-fdp-hbm-sme",
      },
      {
        title: "2026: case-by-case", mode: "controls", date: "2026-02-01", bloc: "allies",
        caption: "BIS revised its licence review policy for certain chips to China.",
        focus: ["ctl:us-bis-2026-01-h200-case-by-case"], quotes: [{ entity: "ctl:us-bis-2026-01-h200-case-by-case", ev: 0 }],
        select: "ctl:us-bis-2026-01-h200-case-by-case",
      },
    ],
  },
];
