"""Create all agent pages for Suite World."""
import json, urllib.request

AGENT_ID = "4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71"
BASE_URL = "http://localhost:50052"

def post_json(path, data):
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}{path}", data=payload,
        headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

pages = [
    {
        "slug": "home",
        "title": "Suite World — Quality Furniture for Every Home",
        "content_markdown": """# Welcome to Suite World

Your trusted furniture destination in Dover, Kent. We've been helping customers across Kent find the perfect sofa, chair, and furniture suite for over 15 years.

## Why Choose Suite World?

- **Premium Brands** — La-Z-Boy, Sherborne, Alstons, and more
- **Flexible Finance** — Interest-free credit and payment plans available
- **Local Showroom** — See, sit, and feel before you buy at our Dover showroom
- **Free Local Delivery** — On orders over £499 within 20 miles

## Our Range

<div data-vibeful-widget='{"widget_id":"cat-leather","type":"card","props":{"title":"Leather Suites","description":"Luxury leather sofas, corner suites, and recliners from top brands. Built to last and timeless in style.","href":"/leather-suites","image":"🛋️"}}'></div>

<div data-vibeful-widget='{"widget_id":"cat-fabric","type":"card","props":{"title":"Fabric Suites","description":"Endless colours and textures. From classic weaves to modern velvets — your perfect fabric sofa awaits.","href":"/fabric-suites","image":"🧵"}}'></div>

<div data-vibeful-widget='{"widget_id":"cat-corner","type":"card","props":{"title":"Corner Suites","description":"Maximise your living space with our range of fabric and leather corner sofas.","href":"/corner-suites","image":"📐"}}'></div>

<div data-vibeful-widget='{"widget_id":"cat-recliner","type":"card","props":{"title":"Recliner Suites","description":"Ultimate comfort with manual and power recliners. Sink into a La-Z-Boy today.","href":"/recliner-suites","image":"🪑"}}'></div>

<div data-vibeful-widget='{"widget_id":"cat-sofabed","type":"card","props":{"title":"Sofa Beds","description":"Practical and stylish — our sofa beds are perfect for guests and multi-purpose rooms.","href":"/sofa-beds","image":"🛏️"}}'></div>

<div data-vibeful-widget='{"widget_id":"cat-chairs","type":"card","props":{"title":"Chair Centre","description":"From fireside chairs to riser recliners — find the perfect chair for any corner of your home.","href":"/chairs","image":"💺"}}'></div>

## Visit Our Showroom
We're at 9-11 London Road, Dover, Kent, CT17 0ST. Open Monday-Saturday 9am-5:30pm, Sunday 10am-4pm. Call us on 01304 242422.

<div data-vibeful-widget='{"widget_id":"ask-home","type":"button","props":{"label":"Ask Our AI Assistant","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "leather-suites",
        "title": "Leather Suites — Luxury Leather Sofas & Corner Suites",
        "content_markdown": """# Leather Suites

Discover our collection of premium leather sofas, corner suites, and recliners. Leather furniture combines timeless elegance with everyday durability — perfect for family homes and contemporary living spaces.

## Our Leather Range

- **Leather Corner Sofas** — L-shaped luxury, ideal for open-plan living
- **Leather Recliner Sofas** — Ultimate comfort with built-in reclining mechanisms
- **Leather Sofa Beds** — Stylish by day, comfortable by night
- **Leather 2-Seaters** — Compact luxury for smaller rooms
- **Leather 3-Seaters** — The classic family sofa
- **Leather 4-Seaters** — Grand seating for larger living spaces
- **Leather Footstools** — The perfect finishing touch

## Why Choose Leather?

Leather furniture gets better with age. It's naturally durable, easy to clean, and hypoallergenic — making it ideal for families with children and pets. Our leather suites come in a range of colours from classic browns and blacks to contemporary greys and creams.

## Brands Available
Our leather range includes pieces from La-Z-Boy, Sherborne, Alstons, and more. Each brand brings its own style and comfort technology.

## Care Tips
- Wipe with a damp cloth for everyday cleaning
- Condition every 6 months with leather care cream
- Keep away from direct heat sources and sunlight

<div data-vibeful-widget='{"widget_id":"ask-leather","type":"button","props":{"label":"Ask About Leather Suites","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "fabric-suites",
        "title": "Fabric Suites — Stylish Fabric Sofas in Every Colour",
        "content_markdown": """# Fabric Suites

From classic weaves to modern velvets, our fabric suite collection offers endless possibilities. With hundreds of fabric choices across our brands, you're sure to find the perfect colour and texture for your home.

## Our Fabric Range

- **Fabric Corner Sofas** — Versatile L-shapes in your choice of fabric
- **Fabric Recliner Sofas** — Relaxed comfort with manual or power recliners
- **Fabric Sofa Beds** — Practical dual-purpose furniture
- **Fabric 2-Seaters** — Perfect for cosy spaces
- **Fabric 3-Seaters** — The family favourite
- **Fabric 4-Seaters** — Maximum seating for larger families
- **Fabric Footstools** — The finishing touch

## Why Choose Fabric?

Fabric sofas offer the widest choice of colours, patterns, and textures. From hard-wearing weaves perfect for busy family homes to luxurious velvets for a touch of glamour — fabric gives you design freedom. Many of our fabric suites feature removable, washable covers for easy maintenance.

## Brands Available
Our fabric range features pieces from Alstons, Florence Collections, Sherborne, Navinzi, and Ashwood Designs.

<div data-vibeful-widget='{"widget_id":"ask-fabric","type":"button","props":{"label":"Ask About Fabric Suites","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "corner-suites",
        "title": "Corner Suites — L-Shaped Sofas for Maximum Seating",
        "content_markdown": """# Corner Suites

Maximise your living space with a corner sofa. Our corner suites come in fabric and leather, with options for recliners and sofa beds — all designed to make the most of your room layout.

## Our Corner Range

- **Fabric Corner Sofas** — Our most popular choice with endless fabric options
- **Leather Corner Sofas** — Premium corner solutions in beautiful leathers
- **Corner Recliner Sofas** — Corner seating with integrated recliners at each end
- **Corner Sofa Beds** — L-shaped configuration with a pull-out double bed
- **Footstools for Corner Sofas** — Matching footstools to complete your suite

## Which Corner Sofa Is Right for You?

**Left-hand or right-hand facing?** Stand facing the sofa. If the longer section is on your left, it's left-hand facing. Not sure? We'll help you work it out in the showroom.

**Modular options** are available from several of our brands, letting you configure your corner sofa to fit your exact room dimensions.

<div data-vibeful-widget='{"widget_id":"ask-corner","type":"button","props":{"label":"Ask About Corner Suites","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "recliner-suites",
        "title": "Recliner Suites — Manual & Power Reclining Sofas",
        "content_markdown": """# Recliner Suites

Experience the ultimate in comfort with our recliner suite collection. From manual lever-action to smooth electric power recliners, we have seating that lets you put your feet up in style.

## Our Recliner Range

- **Fabric Recliners** — Comfort in your choice of fabric
- **Leather Recliners** — Premium leather reclining
- **Corner Recliner Sofas** — The best of both worlds — corner seating with recliners
- **Power Recliners** — Electric reclining at the touch of a button
- **Recliner 2-Seaters** — Shared comfort for two
- **Recliner 3-Seaters** — Family reclining with multiple positions
- **Recliner 4-Seaters** — Ultimate family comfort with 4 powered seats

## Manual vs. Power Recliners

**Manual recliners** use a lever or push-back mechanism. They're reliable, require no power source, and are typically more affordable. **Power recliners** operate at the touch of a button with smooth, silent motors. Many power recliners also feature adjustable headrests and lumbar support — perfect if you have mobility needs or simply want the ultimate in convenience.

## Featured Brand: La-Z-Boy
La-Z-Boy is synonymous with reclining comfort. Their patented mechanisms are legendary, offering independent leg rest and back recline for truly personalised comfort.

<div data-vibeful-widget='{"widget_id":"ask-recliner","type":"button","props":{"label":"Ask About Recliner Suites","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "sofa-beds",
        "title": "Sofa Beds — Stylish Seating by Day, Comfortable Sleeping by Night",
        "content_markdown": """# Sofa Beds

The perfect solution for guest rooms, studio apartments, and homes where space is at a premium. Our sofa beds combine comfortable seating with a proper sleeping surface — not the lumpy fold-outs of the past.

## Our Sofa Bed Range

- **Fabric Sofa Beds** — Practical and stylish in your choice of fabric
- **Leather Sofa Beds** — Premium guest solutions in beautiful leather
- **Corner Sofa Beds** — Maximum flexibility with L-shaped seating and a pull-out bed
- **2-Seater Sofa Beds** — Compact solutions for smaller rooms
- **3-Seater Sofa Beds** — Our most popular size — seats three, sleeps two
- **4-Seater Sofa Beds** — Maximum sleep space for larger families

## Types of Sofa Bed Mechanism

**Pull-out** — The classic design. The seat cushions lift off and the bed frame pulls out from underneath. Offers a proper mattress for a good night's sleep.

**Click-clack** — The backrest folds flat to create a sleeping surface. Simpler mechanism, lighter weight, and often more affordable.

**Corner sofa beds** — Store the bed within the corner section. The chaise lifts to reveal a pull-out double bed — clever use of space.

<div data-vibeful-widget='{"widget_id":"ask-sofabed","type":"button","props":{"label":"Ask About Sofa Beds","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "chairs",
        "title": "Chair Centre — Armchairs, Recliners & Accent Chairs",
        "content_markdown": """# Chair Centre

A chair for every corner of your home. From classic fireside wingbacks to modern electric riser recliners, our chair collection offers comfort, style, and quality in equal measure.

## Our Chair Range

### Recliner Chairs
- **Manual Recliner Chairs** — Classic lever-operated reclining comfort
- **Electric Recliner Chairs** — Power recline at the touch of a button
- **Rise Recliner Chairs** — Assisted standing for those with mobility needs

### Accent & Occasional Chairs
- **Fireside Chairs** — Classic comfort for the hearth or reading nook
- **Accent Chairs** — Statement pieces that bring a room together
- **Tub Chairs** — Classic curved design, perfect for bedrooms and lounges
- **Swivel Chairs** — 360-degree comfort with modern appeal

### Matching Chairs
- **Sofa Arm Chairs** — Designed to complement your sofa perfectly
- **Leather Chairs** — Premium seating in beautiful leather
- **Fabric Chairs** — Versatile and colourful to match any décor

## Popular Choice: Rise Recliners
Our rise recliner chairs are particularly popular with customers who need a little help getting in and out of their chair. They gently tilt forward to assist standing, then recline at the touch of a button — combining dignity, independence, and comfort.

<div data-vibeful-widget='{"widget_id":"ask-chairs","type":"button","props":{"label":"Ask About Chairs","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "brands",
        "title": "Our Brands — Premium Furniture from Trusted Manufacturers",
        "content_markdown": """# Our Brands

We stock furniture from some of the most respected names in British and international furniture manufacturing. Every brand we carry has been chosen for quality, comfort, and value.

## Alstons Upholstery
Quality British upholstery, handcrafted with care. A family-run business with over 40 years of experience. Alstons sofas feature hardwood frames, high-resilience foam, and come with a 5-year frame guarantee.

## La-Z-Boy
The name that means comfort. La-Z-Boy's patented reclining mechanisms are legendary. Their American styling combines timeless looks with cutting-edge comfort technology.

## Sherborne
Premium sofas and recliners renowned for comfort engineering and classic British design. Known for deep-buttoned upholstery, scroll-arm designs, and exceptional lumbar support.

## Florence Collections
Stylish, contemporary furniture with Italian-inspired design at accessible prices. Over 100 fabric options available.

## Cotswold Chair Company
Traditional British chair-making at its finest. Hand-turned legs, deep-buttoned backs, and premium fabrics.

## Navinzi
Modern, on-trend furniture with clean lines designed for contemporary urban living.

## New Trend Concepts Divani
Cutting-edge European design with Italian flair. Bold, statement-making pieces.

## Ashwood Designs
Quality upholstery combining traditional craftsmanship with modern comfort. Versatile and well-priced.

<div data-vibeful-widget='{"widget_id":"ask-brands","type":"button","props":{"label":"Ask About Our Brands","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "clearance",
        "title": "Clearance — Ex-Display & End-of-Line Furniture at Great Prices",
        "content_markdown": """# Clearance

Fantastic furniture at fantastic prices. Our clearance section features ex-display, end-of-line, and one-off pieces at significantly reduced prices.

## What's in Clearance?

**Ex-display furniture** — Pieces that have been on display in our showroom. They may have minor handling marks but are otherwise as-new. Savings are typically 30-50% off the original price.

**End-of-line** — Discontinued models and last season's colours. Brand new, boxed, and fully guaranteed — just at a clearance price because we're making room for new stock.

**Customer returns** — Items returned under our 14-day policy. Fully inspected and checked before resale.

## Why Buy Clearance?

- Same quality as our regular stock
- Significant savings on premium brands
- Available for immediate (or very quick) delivery
- Full manufacturer warranty still applies

**Important:** Clearance stock changes weekly. What's available today may be gone tomorrow. Visit our showroom or call 01304 242422 to find out what's currently in clearance.

<div data-vibeful-widget='{"widget_id":"ask-clearance","type":"button","props":{"label":"Ask About Clearance Stock","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "package-deals",
        "title": "Package Deals — Furnish a Whole Room and Save",
        "content_markdown": """# Package Deals

Furnish an entire room and save money with our package deals. We bundle sofas, chairs, footstools, and occasional tables into specially priced packages.

## How Package Deals Work

1. **Tell us about your room** — size, style, colour scheme, and budget
2. **We build a package** — selecting coordinating pieces from our range
3. **You save** — package pricing is always better than buying individually

## Popular Packages

### Living Room Package
3-seater sofa + 2 armchairs + footstool + coffee table — everything you need for a complete living room makeover.

### Home Cinema Package
Corner recliner sofa + 2 power recliner chairs — create your own cinema experience at home.

### Guest Room Package
Sofa bed + accent chair + storage footstool — practical and stylish solutions for multi-purpose rooms.

## Why Choose a Package?

- **Save money** — package pricing across multiple items
- **Guaranteed coordination** — pieces designed to work together
- **Single delivery** — everything arrives together
- **One finance application** — spread the cost of your whole room

<div data-vibeful-widget='{"widget_id":"ask-packages","type":"button","props":{"label":"Ask About Package Deals","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "finance",
        "title": "Finance Options — Interest Free Credit & Payment Plans",
        "content_markdown": """# Finance Options

We believe everyone deserves a comfortable home. That's why we offer flexible finance options to help spread the cost of your furniture.

## Interest Free Credit
Spread the cost with 0% APR representative finance. Pay a deposit (typically 10-20%) and the rest in manageable monthly instalments with no interest to pay. Subject to status and affordability.

## Novuna Personal Finance
Our primary finance provider, Novuna Personal Finance is a trading style of Mitsubishi HC Capital UK PLC, authorised and regulated by the Financial Conduct Authority (FCA Register no. 704348). They offer a range of finance options including:
- Interest-free plans (typically 6-12 months)
- Interest-bearing plans for longer terms
- Buy now, pay later options

## Snap Finance
For customers who may not qualify for prime lending, we offer finance through Snap Finance Ltd at Representative 29.9% APR.
- Quick online application
- Decisions in minutes
- Flexible repayment terms
- Snap Finance Ltd is authorised and regulated, registered in England and Wales (No. 08080202)

## Important Information
Suite-World.co.uk Limited is a credit broker, not a lender. We are Authorised and Regulated by the Financial Conduct Authority. Credit is subject to status and affordability. Terms and conditions apply.

<div data-vibeful-widget='{"widget_id":"ask-finance","type":"button","props":{"label":"Ask About Finance Options","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "delivery",
        "title": "Delivery & Returns — Free Local Delivery & 14-Day Returns",
        "content_markdown": """# Delivery & Returns

## Delivery

We deliver across Kent and throughout the UK. Here's what you can expect:

### Our Delivery Service
- **Two-person delivery team** — not a courier drop-off. Your furniture is handled with care.
- **Room of choice placement** — we'll put your furniture exactly where you want it.
- **Packaging removal** — we'll take away the packaging (just ask on delivery day).
- **Assembly included** — our team will assemble your furniture if needed.

### Delivery Timeframes
- **Standard delivery:** Typically 2-6 weeks depending on the manufacturer
- **Express delivery:** 3-5 working days on selected items
- Made-to-order items may take longer — we'll advise at the time of order

### Delivery Costs
- Free local delivery within 20 miles of Dover on orders over £499
- Standard UK mainland delivery: from £49
- Scottish Highlands, islands, and Northern Ireland: please call for a quote

## Returns

### 14-Day Return Policy
If you change your mind, you can return your furniture within 14 days of delivery.

**Conditions:**
- Items must be in original, unused condition
- Original packaging preferred but not essential
- Return delivery charges may apply
- Bespoke or made-to-order items are non-returnable unless faulty

### Faulty Items
All our furniture comes with a manufacturer's warranty. If your item develops a fault, contact us and we'll arrange inspection and repair or replacement under warranty.

## 100% No Risk Guarantee
Shop with complete confidence. Our no-risk guarantee means your purchase is fully protected.

<div data-vibeful-widget='{"widget_id":"ask-delivery","type":"button","props":{"label":"Ask About Delivery","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "about",
        "title": "About Suite World — Your Local Furniture Experts Since 2008",
        "content_markdown": """# About Suite World

Suite-World.co.uk Ltd has been serving Kent and the wider South East with quality furniture since 2008.

## Our Story
What started as a small showroom on London Road, Dover has grown into one of Kent's most trusted furniture retailers. We've built our reputation on three simple principles: quality products, honest advice, and outstanding customer service.

## What We Do
We specialise in sofas, chairs, and furniture suites from the UK's best manufacturers. Our showroom is designed to let you experience furniture properly — sit in it, feel the fabrics, test the mechanisms. We believe buying furniture should be a pleasure, not a chore.

## Why Shop With Us?

- **Independent & family-run** — we answer to our customers, not shareholders
- **Premium brands** — La-Z-Boy, Sherborne, Alstons, and more
- **Flexible finance** — interest-free credit and payment plans
- **Real showroom** — see and feel before you buy
- **Local delivery** — free within 20 miles on orders over £499
- **After-sales care** — we're here long after your purchase

## Visit Us
Our showroom is at 9-11 London Road, Dover, Kent, CT17 0ST. We're open Monday to Saturday 9am-5:30pm and Sunday 10am-4pm. There's plenty of free parking and we're easy to reach from the A2 and A20.

## Company Information
Suite-World.co.uk Ltd is a company registered in England and Wales. Company Registration Number: 06455510. Registered Office: 9-11 London Road, Dover, Kent, CT17 0ST.

We are authorised and regulated by the Financial Conduct Authority as a credit broker.

<div data-vibeful-widget='{"widget_id":"ask-about","type":"button","props":{"label":"Ask Us Anything","variant":"primary","action":"open-chat"}}'></div>
"""
    },
    {
        "slug": "contact",
        "title": "Contact Us — Get in Touch with Suite World",
        "content_markdown": """# Contact Suite World

We'd love to hear from you. Whether you have a question about our products, want to check stock, or need directions to our showroom — we're here to help.

## Visit Our Showroom
**Address:** 9-11 London Road, Dover, Kent, CT17 0ST

**Opening Hours:**
- Monday to Saturday: 9:00am — 5:30pm
- Sunday: 10:00am — 4:00pm

We have plenty of free customer parking and are easy to reach from the A2 and A20.

## Call Us
**Phone:** 01304 242422

Give us a call during opening hours. Our friendly team is always happy to discuss products, check stock, or arrange a visit.

## Email
**Email:** sales@suite-world.co.uk

Drop us an email anytime — we aim to respond within one working day.

## Find Us
We're on London Road (the main A258) in Dover. If you're coming from the A2, follow signs for Dover town centre and you'll find us on the left as you enter town. From the A20, head towards the town centre and we're on the right.

We're approximately 10 minutes from Dover Priory railway station and on several local bus routes.

## Social Media
Follow us for new arrivals, special offers, and design inspiration. Find us on Facebook and Instagram @SuiteWorldDover.

<div data-vibeful-widget='{"widget_id":"ask-contact","type":"button","props":{"label":"Chat With Our AI Assistant","variant":"primary","action":"open-chat"}}'></div>
"""
    },
]

print(f"Creating {len(pages)} pages...")
for i, page in enumerate(pages):
    result = post_json("/v1/pages", {
        "agent_id": AGENT_ID,
        "slug": page["slug"],
        "title": page["title"],
        "content_markdown": page["content_markdown"],
        "published": True
    })
    print(f"  [{i+1}/{len(pages)}] {page['slug']} — ID: {result['id']}")

print(f"\nAll {len(pages)} pages created and published!")
