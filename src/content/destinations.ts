export interface DestinationFaq {
  question: string;
  answer: string;
}

export interface Destination {
  slug: string;
  name: string;
  tagline: string;
  country: string;
  bestMonths: string;
  avgTemp: string;
  rainfall: string;
  riding: string[];
  climbs: string[];
  practical: {
    airport: string;
    bikeHire: string;
    accommodation: string;
  };
  faqs: DestinationFaq[];
  /** Slug for the matching /collections page, or null if none exists. */
  collectionSlug: string | null;
}

export const destinations: Destination[] = [
  {
    slug: "girona",
    name: "Girona",
    tagline: "Where the pros train and the roads stay quiet",
    country: "Spain",
    bestMonths: "March to June, September to November",
    avgTemp: "14-27 C across the riding season",
    rainfall: "Driest months are June through August; spring can bring afternoon showers in the hills",
    riding: [
      "Girona is the unofficial cycling capital of Europe. A few hundred professional riders live here for a reason: within 30 minutes of the medieval old town you reach rolling farmland, coastal flats, volcanic terrain in the Garrotxa, and the first serious foothills of the Pyrenees. Traffic on the secondary roads to the north and west is almost non-existent.",
      "The terrain suits every rider. If you want steady Zone 2 volume, the GI-554 corridor towards Banyoles and the lake loop is flat-to-rolling perfection. If you want to hurt, Rocacorba, Mare de Deu del Mont, and the Pyrenean cols around Camprodon are all within reach of a long day. Gravel riders can disappear into the volcanic tracks around Olot or head east to the coastal paths of the Costa Brava.",
      "Road surfaces are generally excellent. The Catalan government resurfaces cycling-popular roads regularly, and local drivers are accustomed to large groups. The cafe culture rounds it off: rides start and end at La Fabrica, Federal, or any of the bike-friendly stops along the Onyar.",
    ],
    climbs: [
      "Els Angels (10 km, avg 4-5%) — the daily bread of every Girona-based rider, steady gradient to a hilltop sanctuary at 485 m",
      "Rocacorba (10 km, avg 7%, ramps to 15%) — the local test piece, finishing above 990 m at the antenna cluster; sub-40 is a strong amateur benchmark",
      "Mare de Deu del Mont (12 km, avg 5.5%) — a longer, more isolated climb north of Banyoles through dense forest",
      "Coll de Bracons (10 km, avg 5.8%) — a quiet Pyrenean approach climb with consistent gradient and beautiful views",
      "Santa Pellaia loop — not a single climb but a rolling circuit through the Gavarres massif, punchy and technical",
    ],
    practical: {
      airport:
        "Barcelona El Prat (BCN) is 1h15 by car or 1h40 by direct train. Girona-Costa Brava airport (GRO) handles seasonal Ryanair flights and is 15 minutes from town.",
      bikeHire:
        "Several shops in the old town rent high-end road and gravel bikes: Eat Sleep Cycle, Trek Travel, and La Bicicleta. Book frames in advance during March-May peak.",
      accommodation:
        "The old town (Barri Vell) is the classic base — walkable to cafes and ride start points. Budget hostels to boutique hotels. For longer stays, apartments in the Eixample or Pedret neighborhoods are popular with visiting riders.",
    },
    faqs: [
      {
        question: "Is Girona good for cycling?",
        answer:
          "Girona is arguably the best cycling destination in Europe. Hundreds of professional riders live here year-round thanks to the combination of quiet roads, varied terrain from flat coastal lanes to Pyrenean cols, reliable weather and a strong cycling culture with bike-friendly cafes and shops throughout the city.",
      },
      {
        question: "When is the best time to cycle in Girona?",
        answer:
          "The peak season runs from March to June and September to November. Spring offers mild temperatures (15-22 C), wildflowers and manageable tourist traffic. Autumn is drier and slightly warmer. July and August are hot (30 C+) but rideable with early starts. Winter (December-February) is cool but rarely freezing at lower elevations.",
      },
      {
        question: "How do I get to Girona with a bike?",
        answer:
          "Fly into Barcelona El Prat and take the train or drive (1h15). Most airlines accept bike boxes as checked luggage. Girona-Costa Brava airport handles seasonal low-cost flights and is 15 minutes from the city centre. Several bike hire shops in Girona also offer airport transfers.",
      },
      {
        question: "Can I ride gravel in Girona?",
        answer:
          "Yes. The volcanic zone around Olot and the Garrotxa natural park has excellent gravel tracks. The coastal paths along the Costa Brava and the forest tracks through the Gavarres massif are also popular. Many Girona-based pros train on gravel year-round.",
      },
      {
        question: "What are the must-ride climbs near Girona?",
        answer:
          "Els Angels is the signature daily climb (10 km, 4-5%). Rocacorba is the test piece (10 km, 7% average with ramps to 15%). For longer efforts, Mare de Deu del Mont and the Pyrenean cols around Camprodon and Coll de Bracons are all within reach of a full day out.",
      },
    ],
    collectionSlug: "girona",
  },

  {
    slug: "mallorca",
    name: "Mallorca",
    tagline: "The original spring training island",
    country: "Spain",
    bestMonths: "February to May, September to November",
    avgTemp: "12-26 C across the riding season",
    rainfall: "Very dry from May through September; winter storms can close mountain passes briefly",
    riding: [
      "Mallorca set the template for the European cycling camp. Every February, thousands of riders from northern Europe descend on the island to escape the dark and log volume on wide, well-surfaced roads with almost no traffic outside Palma. The Serra de Tramuntana mountain range that runs along the northwest coast provides the drama: a 90 km spine of twisting cliff roads, deep descents, and cols that would not look out of place in a Grand Tour.",
      "The central plain (Es Pla) offers flatter, faster riding for recovery days or tempo work, with long straight roads cutting through almond orchards and small farming villages. The east coast and southeast are rolling, with punchy climbs of 2-5 km that suit interval work. Whichever direction you ride, the road quality is excellent and drivers are used to cyclists.",
      "The island is compact enough that you can design a ride from Palma in almost any direction and make it back without retracing. A 100 km loop might include flat motorway-adjacent bike paths, a col in the Tramuntana, a coastal descent, and a recovery stretch across the plain. That density of variety is what brings the pro teams here every year.",
    ],
    climbs: [
      "Sa Calobra (9.5 km, avg 7%) — the iconic island climb with 26 hairpins descending to a remote cove; most riders do it in reverse, climbing out",
      "Puig Major via Coll dels Reis (14 km, avg 6.2%) — the highest accessible road on the island, spectacular views of the Cuber and Gorg Blau reservoirs",
      "Coll de Soller (4.8 km, avg 7.5%) — a short, sharp climb from the Palma side with an old-school feel and a fast descent into Soller",
      "Cap de Formentor (5 km, avg 4%) — the photogenic lighthouse road with sheer drops and coastal views, more about the scenery than the gradient",
      "Orient from Bunyola (5 km, avg 5.5%) — a hidden gem in the interior, punchy and quiet",
    ],
    practical: {
      airport:
        "Palma de Mallorca (PMI) is one of the best-connected airports in Europe with direct flights from most major cities. It is 10 km from the city centre.",
      bikeHire:
        "Bike hire is a mature industry here. Mallorca Cycling Center, Papillon Cycling, and Pro Cycle Hire all stock top-end frames. Most deliver to your hotel. Book at least a month ahead for February-April.",
      accommodation:
        "Palma is the best base for variety. Port de Pollenca and Alcudia in the north put you closer to the Tramuntana climbs. Many riders stay in dedicated cycling hotels (with bike storage, workshops, laundry) throughout the island.",
    },
    faqs: [
      {
        question: "Why do so many cyclists go to Mallorca?",
        answer:
          "Mallorca combines warm weather, excellent road surfaces, low traffic outside Palma, and the Serra de Tramuntana mountains in a compact island format. It is easy to reach from anywhere in Europe, has a mature cycling tourism industry with bike hire and cycling hotels, and offers everything from flat recovery spins to serious mountain stages.",
      },
      {
        question: "When is the best time to cycle in Mallorca?",
        answer:
          "February to May is peak season: the almond blossom is out, temperatures are 14-22 C, and the island is set up for cyclists. September to November is equally good with warmer sea temperatures. June through August can exceed 35 C, making midday riding uncomfortable. Winter (December-January) is cool but rideable.",
      },
      {
        question: "Is Sa Calobra as hard as people say?",
        answer:
          "Sa Calobra is 9.5 km at an average of 7% with 26 hairpins and some sections above 10%. It is a hard climb but the real challenge is the return ride up from the cove since most riders descend first. The road surface and engineering are superb. Allow 40-50 minutes for a strong amateur ascent.",
      },
      {
        question: "Can beginners cycle in Mallorca?",
        answer:
          "Absolutely. The central plain and east coast offer flat to gently rolling terrain with well-surfaced roads. You can easily plan routes that avoid the Tramuntana climbs entirely. Many cycling hotels cater specifically to mixed-ability groups with guided rides at different levels.",
      },
      {
        question: "How do I get around Mallorca by bike?",
        answer:
          "The island is only about 75 km wide. Most riders base themselves in one location and ride loops. Palma gives the most route variety; Port de Pollenca is closest to the big climbs. The Ma-10 mountain road is the main cycling artery through the Tramuntana.",
      },
    ],
    collectionSlug: "mallorca",
  },

  {
    slug: "dublin",
    name: "Dublin",
    tagline: "City rides, coastal roads, and mountains on the doorstep",
    country: "Ireland",
    bestMonths: "April to September",
    avgTemp: "9-20 C across the riding season",
    rainfall: "Rain is possible any day; the driest stretch is April to June. Always bring a gilet",
    riding: [
      "Dublin is not an obvious cycling destination, but it punches above its weight. Within 30 minutes of the city centre you reach the Wicklow Mountains, the coastal road south through Killiney and Bray, and the flat rolling farmland of Meath and Kildare to the west. The variety is genuine: you can ride a 100 km loop from Dublin that includes a serious mountain pass, a coastal stretch, and quiet country lanes.",
      "The south Dublin corridor is where most road riders head. The R115 (Military Road) cuts across the top of the Dublin Mountains and connects to the Sally Gap, one of the most photogenic passes in Ireland. Heading further south, the N11 cycle path links Dublin to Bray and the coastal road continues to Greystones and beyond into Wicklow. Heading north, the coast road through Howth Head is a classic short loop with one sharp climb.",
      "Wind is the dominant weather factor, not rain. A southwesterly breeze is the norm, which means rides heading south into Wicklow often have a tailwind on the outbound leg and a headwind coming home. Route planning with the wind makes a significant difference to ride quality. The Irish cycling community is strong and growing, with group rides leaving from multiple clubs across the city every weekend.",
    ],
    climbs: [
      "Sally Gap via R115 (15 km, avg 3.5%) — a long, steady grind across open moorland above 500 m, exposed and beautiful",
      "Howth Head (3 km, avg 6%) — a short, punchy coastal climb with views across Dublin Bay",
      "Kilmashogue Lane (2 km, avg 8%) — a sharp ramp in the Dublin Mountains, popular for interval efforts",
      "Ticknock (3 km, avg 5%) — a forest climb with multiple route options, close to the city",
      "The Scalp (2 km, avg 4%) — a narrow road through a glacial valley between Enniskerry and Kilternan",
    ],
    practical: {
      airport:
        "Dublin Airport (DUB) is 12 km north of the city centre with direct flights across Europe and North America. The airport is well-connected by bus and taxi.",
      bikeHire:
        "Road bike hire in Dublin is more limited than southern European destinations. Cycle Superstore and some specialist shops offer rental. For a dedicated cycling trip, bringing your own bike is recommended.",
      accommodation:
        "South Dublin (Ranelagh, Rathmines, Dun Laoghaire) puts you closest to the Wicklow riding. The city centre works for shorter trips. Hotels and B&Bs are plentiful but book ahead for summer weekends.",
    },
    faqs: [
      {
        question: "Is Dublin good for road cycling?",
        answer:
          "Dublin is surprisingly good for road cycling. The Wicklow Mountains are 30 minutes from the city centre, the coastal road south is a classic, and the surrounding countryside offers quiet lanes in every direction. The cycling community is active with regular group rides. Weather is the main variable - dress in layers and expect wind.",
      },
      {
        question: "When is the best time to cycle in Dublin?",
        answer:
          "April to September offers the longest days and mildest weather. May and June are the driest months. Irish summers rarely exceed 22 C, which makes for comfortable riding. Daylight extends past 10pm in midsummer. Winter riding is possible but days are short and wet.",
      },
      {
        question: "What is the best cycling route from Dublin?",
        answer:
          "The classic loop runs south through Dundrum, over the Dublin Mountains via the R115 to the Sally Gap, down into Roundwood, and back via Enniskerry and the N11 cycle path. It covers about 80-100 km with around 1200 m of climbing and takes in moorland, mountain passes, and forest descents.",
      },
      {
        question: "Can I cycle to Wicklow from Dublin?",
        answer:
          "Yes. The Wicklow Mountains are directly accessible from south Dublin. You can ride from the city centre to the Sally Gap in about 25 km. The N11 cycle path and the R116 through Enniskerry provide traffic-free or low-traffic routes into the mountains.",
      },
      {
        question: "Is it safe to cycle in Dublin?",
        answer:
          "Dublin has expanding cycle infrastructure in the city centre, but most road cyclists head south or west into quieter roads quickly. The R-roads in Wicklow and the surrounding counties carry light traffic. As anywhere, early starts on weekdays avoid the worst congestion. High-visibility clothing is recommended given the changeable light.",
      },
    ],
    collectionSlug: "dublin",
  },

  {
    slug: "calpe",
    name: "Calpe",
    tagline: "Sun, climbs, and pro-team winter camps on the Costa Blanca",
    country: "Spain",
    bestMonths: "January to May, October to December",
    avgTemp: "12-28 C across the riding season",
    rainfall: "Almost no rain from May to September; occasional heavy downpours in autumn",
    riding: [
      "Calpe is where northern European pro teams go when they need guaranteed sunshine in January. The small coastal town on Spain's Costa Blanca sits at the foot of the Penon de Ifach rock and serves as the base for some of the best winter and spring riding in Europe. The terrain inland is relentlessly hilly: a network of quiet CV-roads climb through almond and orange groves into the Marina Alta and Marina Baixa mountains.",
      "The riding from Calpe falls into two broad categories. Heading inland through Jalon Valley and the Coll de Rates, you hit sustained climbs of 5-12 km with good surfaces and almost no traffic. The roads twist through small villages like Tarbena, Guadalest, and Confrides, and the terrain is steep enough to accumulate 2000+ metres of climbing in a 100 km ride. Heading north along the coast or south towards Benidorm, the terrain flattens slightly but remains rolling.",
      "Calpe's advantage over Mallorca is the depth of climbing. The mountains behind the coast are genuinely mountainous - the Aitana massif reaches 1558 m - and the roads that cross them are quiet, well-maintained, and steep. You can ride a different climbing route every day for a week without repeating a col. The trade-off is that flat recovery rides require more route planning, since virtually every road inland goes up.",
    ],
    climbs: [
      "Coll de Rates (6.5 km, avg 5.5%) — the signature Calpe climb, a steady col connecting the coast to the Jalon Valley",
      "Cumbre del Sol (3 km, avg 8%) — a short, fierce ramp with Mediterranean views from the top",
      "Puerto de Tudons via Tarbena (10 km, avg 5.8%) — a longer climb through cherry orchards into the high mountains",
      "Alt de Confrides (8 km, avg 5.2%) — a remote and beautiful col in the Sierra de Aitana",
      "Bernia (4 km, avg 9%) — a brutally steep dead-end road to the Bernia ridge, popular for interval work",
    ],
    practical: {
      airport:
        "Alicante-Elche (ALC) is 1h15 north and has extensive European connections. Valencia (VLC) is 1h30 south. Both are well served by low-cost carriers.",
      bikeHire:
        "Several shops in Calpe and nearby Altea cater specifically to cycling tourists: Bike Station Calpe, CycleCalpe, and Tactic Sport. High-end road bikes are widely available. Book ahead for January-March pro team camp season.",
      accommodation:
        "Calpe has a huge range of apartments and hotels. Many visiting cyclists stay in self-catering apartments near the port. The town is compact and walkable. For a quieter base, Altea (10 km south) is a charming alternative.",
    },
    faqs: [
      {
        question: "Why do pro cycling teams train in Calpe?",
        answer:
          "Calpe offers reliable winter sunshine (average 300+ sunny days per year), a network of quiet climbing roads starting directly from town, and a compact base with good accommodation and services. Teams including Jumbo-Visma, Movistar, and Lotto have used Calpe for January camps for years.",
      },
      {
        question: "When is the best time to cycle in Calpe?",
        answer:
          "January to May and October to December. Winter temperatures of 12-18 C are ideal for hard training. Spring (March-May) is perfect at 18-25 C. Summer (June-September) exceeds 30 C and is uncomfortably hot for long rides. Autumn offers warm weather with shorter days.",
      },
      {
        question: "How hilly is cycling around Calpe?",
        answer:
          "Very hilly. Almost every road inland climbs immediately. A typical 100 km ride from Calpe accumulates 1500-2500 m of elevation gain. Flat routes require staying on the coast. This makes Calpe ideal for climbers and riders building strength, but less suited to pure recovery or flat time-trial work.",
      },
      {
        question: "Is Calpe or Mallorca better for cycling?",
        answer:
          "Both are excellent. Mallorca is better for mixed groups and has more flat terrain options. Calpe has steeper, deeper climbing and is slightly warmer in winter. Mallorca has a more developed cycling tourism industry. Calpe is better value. Many serious riders prefer Calpe for focused training camps and Mallorca for group holidays.",
      },
      {
        question: "Can I ride gravel near Calpe?",
        answer:
          "There is some gravel in the mountains behind Calpe, particularly around the Sierra de Bernia and in the Jalon Valley. However, Calpe is primarily a road cycling destination. The gravel is rougher and less developed than Girona's or Mallorca's off-road options.",
      },
    ],
    collectionSlug: "calpe",
  },

  {
    slug: "wicklow",
    name: "Wicklow",
    tagline: "Ireland's mountain playground, 30 minutes from Dublin",
    country: "Ireland",
    bestMonths: "April to September",
    avgTemp: "8-18 C across the riding season",
    rainfall: "Frequent light rain year-round; the eastern valleys are drier than the mountain tops. Pack a rain cape",
    riding: [
      "The Wicklow Mountains are the closest real mountains to Dublin, and for Irish cyclists they are the default training ground. The landscape is raw: open moorland, deep glacial valleys, conifer plantations, and exposed mountain passes above 500 m. The roads are mostly single-carriageway R-roads with light traffic, and the views on a clear day reach from the Irish Sea to the midlands.",
      "The Military Road (R115) is the backbone. Built by the British army after the 1798 rebellion to access the mountain interior, it runs roughly north-south across the range, climbing over several passes including the Sally Gap (503 m) and the Wicklow Gap (470 m). These passes are not Alpine in gradient but they are long, exposed, and often windy. The climbing is steady rather than steep: 3-5% over 10-15 km stretches.",
      "Beyond the main passes, Wicklow offers excellent quieter roads through the eastern valleys. The Glendalough valley, Glenmalure (the longest glacial valley in Ireland), and the Avoca valley all have scenic, low-traffic roads. Gravel and MTB riders can access forest tracks and fireroads throughout the Wicklow Mountains National Park. The terrain rewards riders who like long, steady efforts in quiet surroundings more than short, explosive climbs.",
    ],
    climbs: [
      "Sally Gap via R115 from Dublin (15 km, avg 3.5%) — the classic mountain pass across open moorland",
      "Wicklow Gap (10 km, avg 3%) — a quieter, more remote pass from Hollywood to Glendalough",
      "Lugnaquilla approach via Glenmalure (8 km, avg 4%) — a dead-end road into Ireland's deepest valley",
      "Shay Elliott memorial climb (4 km, avg 5%) — a short climb to a memorial for Ireland's first Tour de France stage winner",
      "Djuce Mountain via R759 (6 km, avg 4.5%) — a forest road climb with views over Powerscourt waterfall",
    ],
    practical: {
      airport:
        "Dublin Airport (DUB) is the nearest international airport, about 1h15 from the heart of Wicklow by car. The DART rail line reaches as far south as Greystones on the Wicklow border.",
      bikeHire:
        "Limited bike hire in Wicklow itself. Most riders bring their own or hire in Dublin. Some accommodation providers in the area can arrange bike rental on request.",
      accommodation:
        "Glendalough, Roundwood, and Enniskerry are popular bases. B&Bs and guesthouses are the norm. For road cyclists, Enniskerry puts you at the foot of the Dublin Mountains with quick access to the Military Road. Laragh and Glendalough work for rides deeper into the range.",
    },
    faqs: [
      {
        question: "Is Wicklow good for cycling?",
        answer:
          "Wicklow is excellent for cycling. The mountain passes (Sally Gap, Wicklow Gap) are long and scenic, the roads carry light traffic, and the landscape is dramatic open moorland and glacial valleys. It is the primary training ground for Dublin-based cyclists and offers a genuine mountain experience within easy reach of the capital.",
      },
      {
        question: "When is the best time to cycle in Wicklow?",
        answer:
          "May to September offers the best weather and longest days. Even in summer, conditions above 400 m can change quickly - cloud, wind and rain can appear fast. Carry layers. Autumn colour in October is spectacular but days shorten rapidly. Winter riding is possible but the high passes can be icy.",
      },
      {
        question: "How hard is the Sally Gap?",
        answer:
          "The Sally Gap is not steep (average 3.5%) but it is long (15 km from the Dublin side) and very exposed. Wind is the main difficulty - a headwind over the open moorland above 450 m can turn a moderate climb into a genuine effort. On a calm day, strong recreational riders complete it in 40-50 minutes.",
      },
      {
        question: "Can I do gravel riding in Wicklow?",
        answer:
          "Yes. The Wicklow Mountains National Park has an extensive network of forest fireroads and tracks. The Ballinastoe MTB trails are purpose-built. For gravel bikes, the fireroads in Glendalough, Laragh, and the Devil's Glen offer long off-road loops. Surface quality varies from smooth gravel to rough forestry track.",
      },
      {
        question: "What is the best cycling loop in Wicklow?",
        answer:
          "The classic loop runs from Enniskerry over the Sally Gap, down into Laragh, through Glendalough, over the Wicklow Gap to Hollywood, and back via Blessington. It covers approximately 110 km with 1500 m of climbing and takes in two mountain passes, a glacial valley, and quiet rolling farmland.",
      },
    ],
    collectionSlug: "wicklow",
  },

  {
    slug: "tenerife",
    name: "Tenerife",
    tagline: "Volcanic altitude and year-round sunshine for serious climbing",
    country: "Spain",
    bestMonths: "November to April (escape winter), May to June (mild summit)",
    avgTemp: "18-28 C at the coast, 5-15 C above 2000 m",
    rainfall: "Very dry, especially on the south coast; north side and summit can be cloudy. Almost no rain from May to September",
    riding: [
      "Tenerife is where cyclists go to climb. The island is dominated by Mount Teide, a 3718 m volcano with a paved road reaching 2100 m. That single fact shapes everything: from almost any point on the coast, you can ride uphill for 2-3 hours on a continuously ascending road. The gradients are steady (4-7%), the surfaces are superb, and the landscape shifts from subtropical coastal scrub through pine forest to lunar volcanic terrain above the treeline.",
      "The island is increasingly popular with WorldTour teams for altitude camps. The Teide ascent from the south (Vilaflor) or southwest (Chio) provides sustained climbing at altitude that is hard to replicate anywhere in mainland Europe without going to the high Alps. At 2100 m you are training at genuine altitude while sleeping at sea level - the perfect altitude camp protocol.",
      "Beyond Teide, Tenerife has excellent riding throughout the Anaga mountains in the northeast (steep, narrow, technical roads through laurel forest) and the quieter western coast. The TF-28 and TF-21 roads in the south are wide, smooth, and purpose-built for climbing. The north coast is greener but cloudier. Tenerife is not a flat-riding destination: even the coastal roads have constant undulation. Come here to climb.",
    ],
    climbs: [
      "Mount Teide via Vilaflor (35 km, avg 5.2%) — the big one, from sea level to 2100 m through three climate zones",
      "Mount Teide via Chio (30 km, avg 5.5%) — the western approach, slightly steeper with more exposed lava fields",
      "Masca (10 km, avg 6%) — a twisting descent (or brutal climb) to one of the most remote villages on the island",
      "Anaga ridge road (15 km, undulating) — a rollercoaster along a knife-edge ridge in the northeast with sheer drops and dense forest",
      "La Esperanza forest climb (12 km, avg 4.5%) — a steady climb through pine forest from the north coast towards the caldera",
    ],
    practical: {
      airport:
        "Tenerife South (TFS) handles most international charter and low-cost flights. Tenerife North (TFN) serves inter-island and Iberian routes. Both are well connected.",
      bikeHire:
        "Several outfits specialise in cycling tourism: Bike Point Tenerife, Bici Tenerife, and Cycling Tenerife. High-end road bikes and e-road bikes (useful for Teide repeats) are available. Book ahead for December-March winter training season.",
      accommodation:
        "The south coast (Las Americas, Los Cristianos, Costa Adeje) puts you closest to the Teide climbs from Vilaflor. El Medano is a quieter option. Puerto de la Cruz on the north coast is the traditional base for the Anaga mountains. Dedicated cycling hotels are emerging but less common than Mallorca.",
    },
    faqs: [
      {
        question: "Is Tenerife good for cycling?",
        answer:
          "Tenerife is outstanding for cycling if you enjoy climbing. The road to Mount Teide reaches 2100 m on a continuously paved surface, the year-round warm climate means you can train in shorts in January, and the road surfaces are excellent. It is less suited to riders who want flat terrain or large group rides.",
      },
      {
        question: "How hard is cycling up Mount Teide?",
        answer:
          "The standard ascent from the south (via Vilaflor) is around 35 km at an average of 5.2%, gaining about 2000 m of elevation. The gradient is steady, not steep, but the length and altitude make it a serious effort. Most fit recreational riders take 2-3 hours. The altitude above 1800 m is noticeable - expect to lose 5-10% power.",
      },
      {
        question: "When is the best time to cycle in Tenerife?",
        answer:
          "November to April is peak season for cyclists escaping northern European winter. Coastal temperatures sit at 18-24 C. The summit of Teide can be cold (5-10 C) and occasionally has ice or snow on the road. May and June are excellent - warm but not yet scorching. July and August are very hot at lower elevations.",
      },
      {
        question: "Can beginners cycle in Tenerife?",
        answer:
          "Tenerife is a challenging destination. Almost every road goes uphill, and even coastal routes undulate significantly. However, e-bikes are widely available for hire and make the climbs accessible to all fitness levels. Strong beginners who enjoy climbing will love it; riders who prefer flat terrain should look elsewhere.",
      },
      {
        question: "Do pro teams train in Tenerife?",
        answer:
          "Yes. Several WorldTour teams use Tenerife for altitude camps, particularly in January-February and again before Grand Tours. The Teide climb provides sustained efforts at 1500-2100 m altitude while riders can sleep and recover at sea level on the coast. Teams including INEOS Grenadiers and UAE Team Emirates have used Tenerife regularly.",
      },
    ],
    collectionSlug: null,
  },

  {
    slug: "malaga",
    name: "Málaga / Costa del Sol",
    tagline: "Winter sun, mountain roads ten minutes from the beach",
    country: "Spain",
    bestMonths: "October to May",
    avgTemp: "16-24 C through the winter riding season",
    rainfall: "Very dry; occasional wet spells November to January, almost none March onwards",
    riding: [
      "Málaga has quietly become one of Europe's best winter bases. The city sits with its back against the Montes de Málaga, so within fifteen minutes of the seafront you are climbing on quiet, well-surfaced mountain roads while the rest of northern Europe is on the turbo. The A-7000 over the Montes is the classic artery: a steady, beautifully engineered climb that opens into a high plateau of rolling roads towards Colmenar.",
      "Inland the terrain keeps giving. The loop through Colmenar, Riogordo and the Axarquía villages is rolling to hilly with almost no traffic. Further west, the roads around Mijas, Coín and Alhaurín offer punchier riding, and a big day takes you to Ronda over some of Andalusia's most dramatic tarmac. East along the coast, the climbs above Vélez-Málaga suit structured efforts.",
      "Surfaces are generally very good on the main training roads, and Andalusian drivers give cyclists room. The coastal N-340 is best avoided in favour of the inland alternatives. Café stops are everywhere — Colmenar's village squares are the standard mid-ride halt.",
    ],
    climbs: [
      "Puerto del León via the A-7000 (15 km, avg 5%) — Málaga's signature climb through the Montes, steady gradient and a fast, open descent to Colmenar",
      "Mijas from Fuengirola (8 km, avg 5-6%) — the Costa del Sol test climb to the white village, popular for repeat efforts",
      "Puerto de los Pescadores (7 km, avg 5%) — the gateway to the Axarquía loops from the coast",
      "Comares (10 km, avg 6%, ramps over 10%) — a balcony village finish with views over the whole Axarquía",
      "Ronda day (140 km+ round trip) — not one climb but a mountain epic via El Burgo or the A-366, the region's big-day benchmark",
    ],
    practical: {
      airport:
        "Málaga-Costa del Sol (AGP) has direct flights from most of Europe year-round, including multiple daily Irish and UK connections. The city is 15 minutes from the terminal.",
      bikeHire:
        "High-end road hire is well established: shops in Málaga city, Fuengirola and Benalmádena rent current-generation carbon bikes. Book December-March in advance — winter training camp demand is high.",
      accommodation:
        "Málaga city east side (Pedregalejo, El Palo) puts you closest to the Montes climbs. Fuengirola and Benalmádena suit riders heading for Mijas and the western hills. Plenty of apartment stock for week-long stays.",
    },
    faqs: [
      {
        question: "Is Málaga good for winter cycling?",
        answer:
          "Málaga is one of the best winter cycling destinations in Europe. Daytime temperatures of 16-20 C from November to March, very little rain, and mountain climbs starting within fifteen minutes of the city make it ideal for winter training volume.",
      },
      {
        question: "What is the best climb in Málaga?",
        answer:
          "Puerto del León via the A-7000 is the signature climb: around 15 km at a steady 5% on a beautifully surfaced road through the Montes de Málaga, with quiet traffic and a fast descent to Colmenar on the far side.",
      },
      {
        question: "When is the best time to cycle on the Costa del Sol?",
        answer:
          "October to May. Mid-winter (December-February) is mild and dry by northern European standards, and spring brings 20-24 C with green hillsides. July and August are too hot for long rides except at dawn.",
      },
      {
        question: "How do I get to Málaga with a bike?",
        answer:
          "Fly direct to Málaga-Costa del Sol (AGP) — it is one of Spain's best-connected airports with year-round routes from Ireland and the UK. Most airlines carry bike boxes as sports luggage; the airport is 15 minutes from the city.",
      },
      {
        question: "Is the riding in Málaga hilly?",
        answer:
          "Yes — the coast is backed by mountains, so most quality riding involves climbing. Flat options exist along the coast and the Guadalhorce valley, but the appeal is steady mountain climbs like Puerto del León and the rolling Axarquía terrain inland.",
      },
    ],
    collectionSlug: null,
  },

  {
    slug: "gran-canaria",
    name: "Gran Canaria",
    tagline: "A volcano of switchbacks with summer all winter",
    country: "Spain",
    bestMonths: "October to April",
    avgTemp: "18-25 C at the coast year-round; cooler at altitude",
    rainfall: "Minimal in the south; the summit can catch cloud and showers in winter",
    riding: [
      "Gran Canaria is a near-circular volcanic island that rises to almost 2,000 m in its centre, which means every ride is a choice of how much climbing you want — and the answer can be enormous. From the southern resorts the roads tilt upwards almost immediately into ravine climbs with engineered gradients, endless switchbacks and very little traffic once you leave the coast.",
      "The Valley of the Tears (VOTT) is the island's legend: a brutally steep road on the GC-606 with sustained double-digit ramps, regularly named among the hardest climbs in Europe. But the everyday riding is friendlier — Fataga, Ayagaures and Soria are steady, scenic climbs, and the full ascent to Pico de las Nieves is a 40+ km drag to the island's roof with views over the cloud sea to Teide.",
      "Winter is peak season: while northern Europe freezes, the south of the island sits at 20-24 C. Wind is a factor on exposed ridges, and the descents are long and technical — good brakes and cool judgement matter here.",
    ],
    climbs: [
      "Pico de las Nieves from Maspalomas via Fataga (45 km to 1,920 m) — the island's roof, a full morning of climbing in one effort",
      "Valley of the Tears / GC-606 (12 km, avg 9%, sustained ramps over 15%) — one of Europe's hardest climbs; bring a 34 and humility",
      "Ayagaures (10 km, avg 5%) — the steady local climb from the southern resorts, perfect for structured efforts",
      "Soria (18 km, avg 4-5%) — a long, scenic valley climb to the reservoir and the foot of the VOTT",
      "Fataga (14 km, avg 4%) — switchbacks through a protected ravine, the most photographed road on the island",
    ],
    practical: {
      airport:
        "Gran Canaria (LPA) has year-round direct flights from Dublin and most of Europe. The southern resorts — the usual cycling bases — are 20-30 minutes from the terminal.",
      bikeHire:
        "Maspalomas and Playa del Inglés have several dedicated road bike rental operations with current carbon bikes and compact gearing. Book ahead December-March.",
      accommodation:
        "Maspalomas is the standard base: direct access to Fataga and Ayagaures, huge hotel and apartment stock, and reliable sun. Las Palmas in the north suits riders who prefer a city base and the wilder northern roads.",
    },
    faqs: [
      {
        question: "Is Gran Canaria good for cycling?",
        answer:
          "Gran Canaria is one of the best winter cycling destinations in the world. The south of the island offers 20-24 C from November to March, quiet engineered mountain roads, and climbing options from steady 4% valley roads to some of the hardest ramps in Europe.",
      },
      {
        question: "How hard is the Valley of the Tears?",
        answer:
          "Very hard. The GC-606 sustains an average around 9% for 12 km with long sections well above 15%. It is regularly listed among Europe's toughest road climbs. Most riders want at least a 34x32 and fresh legs.",
      },
      {
        question: "When is the best time to cycle in Gran Canaria?",
        answer:
          "October to April. Coastal temperatures sit between 18 and 25 C all winter. Summer is rideable but hot inland. The summit of Pico de las Nieves can be 10-15 C cooler than the coast — carry a layer for the descent in any season.",
      },
      {
        question: "Is Gran Canaria too hilly for beginners?",
        answer:
          "There is genuinely flat riding only along the southern coast, so the island suits riders who want to climb. That said, climbs like Fataga and Ayagaures are steady and beautifully graded — a fit beginner with low gearing will manage them comfortably.",
      },
      {
        question: "Gran Canaria or Tenerife for a cycling holiday?",
        answer:
          "Tenerife is built around one giant volcano climb (Teide); Gran Canaria offers more varied route-building with dozens of distinct climbs and loops. For repeat visits and varied training, Gran Canaria edges it; for altitude blocks and the longest single climb in Europe, Tenerife.",
      },
    ],
    collectionSlug: null,
  },

  {
    slug: "lanzarote",
    name: "Lanzarote",
    tagline: "Volcanic roads, honest wind, triathlon hardness",
    country: "Spain",
    bestMonths: "October to April",
    avgTemp: "17-24 C year-round",
    rainfall: "One of the driest places in Europe — rain is rare in any month",
    riding: [
      "Lanzarote is the leanest of the Canary cycling islands: no big mountains, no forests, just a stark volcanic landscape of black rock, white villages and roads that roll constantly without ever climbing for more than half an hour. What it lacks in cols it makes up for in honesty — the wind blows most days, and riding here builds the kind of strength you notice at home.",
      "The island is compact enough to ride end-to-end and back in a long day. The classic loop runs north through Teguise and the Tabayesco climb to the Mirador del Río, with views across to La Graciosa, then back along the wild west coast. South, the roads through Timanfaya's volcanic badlands are like riding on another planet — smooth tarmac through fields of lava.",
      "Lanzarote's sporting culture runs deep: Club La Santa hosts athletes year-round and Ironman Lanzarote has made the island's roads famous in triathlon. Drivers are exceptionally used to cyclists, surfaces are good, and traffic outside Arrecife is light.",
    ],
    climbs: [
      "Tabayesco (10 km, avg 4-5%) — the island's longest climb, a steady drag up the Haría valley to the Mirador de Haría",
      "Mirador del Río (5 km, avg 5%) — the scenic finish at the island's northern cliff edge",
      "Femés (4 km, avg 6%) — short and punchy from either side, the south's repeat-effort hill",
      "Timanfaya traverse — not a climb but the must-ride road through the volcanic park, rolling and otherworldly",
      "La Geria wine valley — rolling roads through black-ash vineyards, the island's signature scenery",
    ],
    practical: {
      airport:
        "Lanzarote (ACE) has year-round direct flights from Dublin and most of Europe, 10-15 minutes from the main resort bases.",
      bikeHire:
        "Good road bike rental in Puerto del Carmen, Costa Teguise and at Club La Santa. Triathlon demand means plenty of quality stock, but book ahead for January-March.",
      accommodation:
        "Puerto del Carmen and Costa Teguise are the standard bases with the widest accommodation choice. Club La Santa is the full sports-resort option with open training facilities.",
    },
    faqs: [
      {
        question: "Is Lanzarote good for cycling?",
        answer:
          "Yes — Lanzarote is a winter cycling staple. It offers 17-24 C temperatures year-round, almost no rain, quiet well-surfaced roads through striking volcanic scenery, and a deep sporting culture built around Club La Santa and Ironman Lanzarote.",
      },
      {
        question: "How windy is Lanzarote for cycling?",
        answer:
          "Genuinely windy — the trade winds blow most days, typically 20-30 km/h. Locals plan loops to finish with a tailwind. It makes the island superb strength training, but riders expecting sheltered climbs should look at Gran Canaria or Tenerife instead.",
      },
      {
        question: "Does Lanzarote have big climbs?",
        answer:
          "No. The longest climb, Tabayesco, is around 10 km at 4-5%. Lanzarote is rolling rather than mountainous — total elevation accumulates through constant undulation and wind resistance rather than long cols.",
      },
      {
        question: "When is the best time to cycle in Lanzarote?",
        answer:
          "October to April for cooler temperatures and the winter training atmosphere, though the island is rideable in every month. Rain is rare at any time of year.",
      },
      {
        question: "What is the classic Lanzarote ride?",
        answer:
          "The northern loop: Teguise, the Tabayesco climb, Mirador del Río at the island's cliff edge, and back along the west coast — roughly 100 km taking in the best of the island's volcanic scenery.",
      },
    ],
    collectionSlug: null,
  },

  {
    slug: "algarve",
    name: "Algarve",
    tagline: "Portugal's quiet-road winter playground",
    country: "Portugal",
    bestMonths: "October to May",
    avgTemp: "15-22 C through the winter season",
    rainfall: "Mild Atlantic winters; most rain falls November to January in short spells",
    riding: [
      "The Algarve is the most underrated winter destination on the European circuit. The coast gets the tourists; the riding happens inland, where the hills of the Serra do Caldeirão and Serra de Monchique hide hundreds of kilometres of quiet, twisting, well-surfaced roads through cork oak and eucalyptus. The Volta ao Algarve brings the pro peloton here every February for a reason.",
      "From the central coast (Albufeira, Vilamoura, Faro) you are into rolling backroads within twenty minutes. The climb to Alto do Malhão — the Volta's iconic summit finish — is short and sharp; the long day west to Fóia, the Algarve's highest point above Monchique, is the region's queen stage. The far west around Sagres and the Costa Vicentina offers wild Atlantic coastal riding when the wind allows.",
      "Portuguese drivers are notably patient, traffic inland is sparse, and food stops are cheap and generous. Surfaces on the main riding roads are good and improving — the region has invested heavily in cycling tourism since the mid-2010s.",
    ],
    climbs: [
      "Fóia from Monchique (8 km, avg 6%) — the Algarve's highest point at 902 m, the region's signature climb with Atlantic views from the summit",
      "Alto do Malhão (2.5 km, avg 9%) — the Volta ao Algarve's famous wall finish, ideal for repeat efforts",
      "Picota (5 km, avg 6%) — Monchique's quieter second summit",
      "Serra do Caldeirão loops via Salir and Barranco do Velho — rolling 4-6% climbs strung together through cork forest, the heart of Algarve riding",
      "Vila do Bispo to Sagres coastal roads — flat to rolling, wind-exposed riding to mainland Europe's southwestern tip",
    ],
    practical: {
      airport:
        "Faro (FAO) has year-round direct flights from Dublin and the UK, 30-45 minutes from the main cycling bases.",
      bikeHire:
        "Established road hire in Vilamoura, Albufeira and Lagos with quality carbon stock; several operators deliver to accommodation. February-April is peak demand.",
      accommodation:
        "Vilamoura and Albufeira are central to the best inland riding and have huge winter apartment availability at low season rates. Lagos suits riders targeting Monchique and the west coast.",
    },
    faqs: [
      {
        question: "Is the Algarve good for cycling?",
        answer:
          "Excellent — the inland Algarve offers quiet rolling roads, mild 15-22 C winters and the climbs made famous by the Volta ao Algarve, while coastal bases provide affordable winter accommodation and direct flights. It is one of Europe's best-value winter training destinations.",
      },
      {
        question: "What are the famous climbs in the Algarve?",
        answer:
          "Alto do Malhão (2.5 km at 9%) is the Volta ao Algarve's iconic summit finish. Fóia above Monchique (8 km at 6%) is the region's highest road at 902 m. Most riding is rolling hills through the Serra do Caldeirão rather than long cols.",
      },
      {
        question: "When is the best time to cycle in the Algarve?",
        answer:
          "October to May. February to April is the sweet spot — the Volta ao Algarve atmosphere, green hills, wildflowers and 17-22 C days. Summer is hot and busy on the coast but the inland hills stay rideable with early starts.",
      },
      {
        question: "Is the Algarve flat or hilly?",
        answer:
          "The immediate coast is flat to rolling; everything inland is constantly rolling with short 4-9% climbs. Total daily climbing adds up quickly — a 100 km inland loop typically gathers 1,200-1,800 m without any single long col.",
      },
      {
        question: "How do I get to the Algarve with a bike?",
        answer:
          "Fly direct to Faro (FAO) — Aer Lingus and Ryanair operate year-round from Dublin. Bike boxes travel as sports luggage, and most hire and transfer companies are used to handling them. The main bases are within 45 minutes of the airport.",
      },
    ],
    collectionSlug: null,
  },

  {
    slug: "lucca",
    name: "Lucca / Tuscany",
    tagline: "Renaissance walls, pro test climbs and Italy's finest riding",
    country: "Italy",
    bestMonths: "March to June, September to October",
    avgTemp: "13-27 C across the riding season",
    rainfall: "Spring and autumn bring occasional wet days; summer is dry and hot",
    riding: [
      "Lucca is Italian cycling distilled: a perfectly preserved walled city sitting between the flat Piana di Lucca — ideal for recovery spins and group work — and the mountains of the Garfagnana and Monte Pisano. Generations of professionals have based themselves here, and Monte Serra remains one of the sport's most famous test climbs, the road where Tuscan careers are measured.",
      "Variety is the region's gift. South, Monte Serra offers four distinct ascents. North, the Garfagnana valley climbs into the Apuan Alps on quiet, dramatic roads beneath marble peaks. West lies the coast at Viareggio for flat tempo; east, rolling vineyard hills towards Montecarlo. A short transfer opens the strade bianche country south of Florence for gravel days.",
      "Italian road culture is the quiet star — drivers wait, café stops are sacred, and every village has a fountain. Surfaces vary from billiard-smooth provincial roads to rougher mountain lanes; the riding rewards a 28 mm tyre.",
    ],
    climbs: [
      "Monte Serra from Buti (9 km, avg 7%) — the classic side of Tuscany's test climb, a benchmark effort for every pro who has lived here",
      "Monte Serra from Calci (10 km, avg 7%) — the harder, more irregular western approach",
      "San Pellegrino in Alpe (13 km, avg 8%, ramps to 18%) — the Garfagnana monster, one of the hardest climbs in the Apennines",
      "Passo delle Radici (20+ km, avg 4-5%) — the long, steady way over the Apennine spine",
      "Pizzorne (10 km, avg 6%) — Lucca's local plateau climb, switchbacks straight out of the plain north of the city",
    ],
    practical: {
      airport:
        "Pisa (PSA) is 30 minutes away with direct flights from Dublin and most of Europe; Florence (FLR) is an hour. Both are well used to bike boxes.",
      bikeHire:
        "Quality road hire in Lucca town and through cycling hotels in the area. Stock is thinner than Mallorca — book well ahead for spring.",
      accommodation:
        "Inside or just outside Lucca's walls is the classic base, with every ride starting through the city gates. Cycling-dedicated hotels around the Piana offer guided groups and workshop facilities.",
    },
    faqs: [
      {
        question: "Is Lucca good for cycling?",
        answer:
          "Lucca is one of Europe's great cycling bases: flat valley roads for easy days, the legendary Monte Serra test climb 30 minutes away, the Apuan Alps and Garfagnana to the north, and Italian café culture throughout. Many professionals have made it home.",
      },
      {
        question: "What is the famous climb near Lucca?",
        answer:
          "Monte Serra — roughly 9-10 km at 7% with several distinct approaches. It has been the benchmark climb for Tuscan professionals for decades, and the Buti side is the standard test effort.",
      },
      {
        question: "When is the best time to cycle in Tuscany?",
        answer:
          "April to June and September to October are ideal: 18-27 C, green landscapes or harvest colours, and stable weather. July and August are hot but rideable with dawn starts. Winter is quiet and cool with occasional rain — many locals ride year-round.",
      },
      {
        question: "Can I ride gravel near Lucca?",
        answer:
          "Yes. The hills around Lucca hide plenty of strade bianche-style white roads, and the famous gravel country of the Crete Senesi and Chianti is within a 1-2 hour transfer for a day trip.",
      },
      {
        question: "How do I get to Lucca with a bike?",
        answer:
          "Fly to Pisa (PSA), 30 minutes from Lucca by car or direct train. Ryanair operates from Dublin year-round. The train accepts boxed bikes, and most cycling hotels arrange airport transfers with bike transport.",
      },
    ],
    collectionSlug: null,
  },

  {
    slug: "nice",
    name: "Nice / Côte d'Azur",
    tagline: "Where the pro peloton lives — cols rising straight from the sea",
    country: "France",
    bestMonths: "March to June, September to November",
    avgTemp: "13-26 C across the riding season",
    rainfall: "Over 300 sunny days a year; autumn brings short heavy showers",
    riding: [
      "More WorldTour professionals live around Nice than almost anywhere else in the sport, and the reason is obvious from the first ride: serious climbing starts inside the city limits. From the Promenade des Anglais you can be on the Col d'Èze in twenty minutes or threading up to the Col de la Madone — the most famous test climb in professional cycling — within the hour.",
      "The riding splits into tiers. The coastal cols (Èze, La Turbie, the three Corniche roads) offer iconic Mediterranean riding with film-set views. Behind them, the middle mountains — Col de Vence, Coursegoules, the Gorges du Loup — provide all-day loops on quiet roads. And in the Alpes-Maritimes proper, the Col de Turini and the high cols of the Tour's final week wait for big days out.",
      "Traffic on the coast itself is heavy; the skill of riding Nice is escaping upward quickly, which every local route does. Surfaces are excellent, the descents are world-class and technical, and the café at the Col d'Èze may host more pros per square metre than anywhere in the sport.",
    ],
    climbs: [
      "Col de la Madone (12 km, avg 7%) — the pro test climb above Menton, made famous by a generation of Tour contenders",
      "Col d'Èze (10 km, avg 5%) — Nice's daily climb, the spine of the old Paris-Nice time trial",
      "Col de Turini (24 km, avg 5%, via Sospel) — the Alpes-Maritimes giant of Monte Carlo Rally fame and Tour de France battles",
      "Col de Vence (10 km, avg 6.5%) — the standard structured-training climb northwest of the city",
      "Madone d'Utelle (15 km, avg 6%) — a dead-end sanctuary summit with the best view on the Côte d'Azur",
    ],
    practical: {
      airport:
        "Nice Côte d'Azur (NCE) is one of Europe's best-connected airports with year-round direct flights from Dublin, sitting 20 minutes from the city's cycling bases.",
      bikeHire:
        "Several high-end rental operations in Nice and along the coast supply current race bikes. Demand peaks around Paris-Nice in March and early summer — reserve ahead.",
      accommodation:
        "Nice itself is the practical base with the widest options; the port district puts you closest to the Col d'Èze side of town. Menton suits riders focused on the Madone and the Italian border roads.",
    },
    faqs: [
      {
        question: "Is Nice good for cycling?",
        answer:
          "Nice is one of the world's great cycling cities — more professional riders live on the Côte d'Azur than almost anywhere else. Famous cols start straight from the coast, the weather allows year-round riding, and the road surfaces and descents are exceptional.",
      },
      {
        question: "What is the Col de la Madone?",
        answer:
          "A 12 km, 7% climb above Menton that became professional cycling's most famous test climb — generations of Tour de France contenders have used it as their form benchmark. The summit road is quiet because it leads almost nowhere, which is exactly why the pros love it.",
      },
      {
        question: "When is the best time to cycle in Nice?",
        answer:
          "March to June and September to November are perfect: 16-26 C and reliable sun. Winter riding is genuinely good by northern standards (13-15 C, mostly dry). July and August are hot and the coast roads are at their busiest.",
      },
      {
        question: "Is riding in Nice traffic-heavy?",
        answer:
          "The coastal strip is busy, but every classic route climbs away from it within minutes. Once on the cols and the balcony roads behind the coast, traffic is light. Local knowledge — or a well-built route — matters more here than in Mallorca or Girona.",
      },
      {
        question: "How hard is the riding around Nice?",
        answer:
          "It is a climber's destination: genuinely flat riding is limited to the Promenade and the Var valley. Everything worthwhile goes uphill, from the 5% Col d'Èze to all-day mountain loops via the Col de Turini. Riders who prefer flat terrain will find Mallorca or the Algarve a better fit.",
      },
    ],
    collectionSlug: null,
  },
];

/**
 * The 10 launch destinations (June 2026 launch build spec): curated route
 * libraries and constrained generation ship for these first. Dublin and
 * Wicklow remain as home-turf coverage outside the destination count.
 */
export const LAUNCH_DESTINATION_SLUGS = [
  "mallorca",
  "girona",
  "malaga",
  "calpe",
  "tenerife",
  "gran-canaria",
  "lanzarote",
  "algarve",
  "lucca",
  "nice",
] as const;

export function getLaunchDestinations(): Destination[] {
  return destinations.filter((d) =>
    (LAUNCH_DESTINATION_SLUGS as readonly string[]).includes(d.slug)
  );
}

export function getDestinationBySlug(slug: string): Destination | undefined {
  return destinations.find((d) => d.slug === slug);
}

export function getAllDestinationSlugs(): string[] {
  return destinations.map((d) => d.slug);
}
