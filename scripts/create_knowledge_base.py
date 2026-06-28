"""Create knowledge base and pages for Suite World agent."""
import json, urllib.request

AGENT_ID = "4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71"
BASE_URL = "http://localhost:50052"

def post_json(path, data):
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}{path}", data=payload,
        headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

# ── Step 1: Create knowledge base context ──
print("Creating knowledge base...")
ctx = post_json("/v1/contexts", {
    "name": "Suite World Product Catalog",
    "agent_id": AGENT_ID
})
ctx_id = ctx["id"]
print(f"  Context ID: {ctx_id}")

# Ingest the catalog
catalog_text = """# Suite World — Complete Product Catalog

## About Suite World
Suite-World.co.uk Ltd is a premier furniture retailer based in Dover, Kent. Company Reg No: 06455510. Registered Office: 9-11 London Road, Dover, Kent, CT17 0ST. Phone: 01304 242422. We are authorised and regulated by the Financial Conduct Authority as a credit broker.

## Leather Suites
Our leather suites combine luxury with durability. Available in classic browns, modern blacks, and contemporary greys.
- **Leather Corner Sofas** — L-shaped luxury for open-plan living. From around £1,299
- **Leather Recliner Sofas** — The ultimate in comfort with built-in recliners. From around £1,499
- **Leather Sofa Beds** — Stylish by day, comfortable by night. From around £1,199
- **Leather 2-Seaters** — Compact luxury for smaller spaces. From around £699
- **Leather 3-Seaters** — The classic family sofa. From around £899
- **Leather 4-Seaters** — Grand seating for larger families. From around £1,199
- **Leather Footstools** — Coordinating comfort. From around £199

## Fabric Suites
Endless colour and texture choices, from classic weaves to modern velvets.
- **Fabric Corner Sofas** — Versatile L-shapes in hundreds of fabrics. From around £899
- **Fabric Recliner Sofas** — Relaxed comfort with manual or power recliners. From around £1,099
- **Fabric Sofa Beds** — Practical dual-purpose furniture. From around £799
- **Fabric 2-Seaters** — Perfect for cosy spaces. From around £399
- **Fabric 3-Seaters** — The family favourite. From around £599
- **Fabric 4-Seaters** — Maximum seating. From around £799
- **Fabric Footstools** — The finishing touch. From around £149

## Corner Suites
Corner sofas in every configuration, maximising seating for open-plan living.
- **Fabric Corner Sofas** — Most popular choice, endless fabric options. From around £899
- **Leather Corner Sofas** — Premium corner solutions. From around £1,299
- **Corner Recliner Sofas** — Corner seating with integrated recliners. From around £1,599
- **Corner Sofa Beds** — Corner configuration with pull-out bed. From around £1,199
- **Footstools for Corner Sofas** — Matching corner footstools. From around £199

## Recliner Suites
From manual to powered, we have recliners for every budget and room size.
- **Fabric Recliners** — Comfort in your choice of fabric. From around £599
- **Leather Recliners** — Premium leather reclining. From around £899
- **Corner Recliner Sofas** — The best of both worlds. From around £1,599
- **Power Recliners** — Electric reclining at the touch of a button. From around £999
- **Recliner 2-Seaters** — Shared comfort. From around £799
- **Recliner 3-Seaters** — Family reclining. From around £1,099
- **Recliner 4-Seaters** — Ultimate family comfort. From around £1,399
- **Footstools for Recliners** — Coordinating comfort. From around £199

## Sofa Beds
Versatile sleep-and-seat solutions for guest rooms and multi-purpose spaces.
- **Fabric Sofa Beds** — Practical and stylish. From around £799
- **Leather Sofa Beds** — Premium guest solutions. From around £1,199
- **Corner Sofa Beds** — Maximum flexibility. From around £1,199
- **2-Seater Sofa Beds** — Compact guest solutions. From around £599
- **3-Seater Sofa Beds** — The most popular size. From around £799
- **4-Seater Sofa Beds** — Maximum sleep space. From around £1,099
- **Footstools for Sofa Beds** — Storage footstools available. From around £169

## Chair Centre
From classic wingbacks to modern riser recliners — a chair for every corner.
- **Fireside Chairs** — Classic comfort for the hearth. From around £349
- **Rise Recliner Chairs** — Assisted standing for mobility support. From around £599
- **Manual Recliner Chairs** — Classic lever-operated comfort. From around £449
- **Electric Recliner Chairs** — Power recline at the touch of a button. From around £699
- **Swivel Chairs** — 360-degree comfort. From around £399
- **Accent Chairs** — Statement pieces for any room. From around £299
- **Sofa Arm Chairs** — Matching chairs for your sofa. From around £349
- **Tub Chairs** — Classic curved design. From around £399
- **Leather Chairs** — Premium seating. From around £499
- **Fabric Chairs** — Versatile and colourful. From around £299

## Brands

### Alstons Upholstery
Quality British upholstery, handcrafted with care. Family-run business with over 40 years of experience. Known for elegant designs, exceptional build quality, and a wide range of fabrics. Alstons sofas feature hardwood frames, high-resilience foam, and a 5-year frame guarantee.

### La-Z-Boy
The world-famous recliner brand — and the name that literally means comfort. La-Z-Boy's patented reclining mechanisms are legendary, offering legendary comfort across sofas, recliners, and corner suites. Their American styling combines timeless looks with cutting-edge comfort technology. La-Z-Boy products come with a comprehensive warranty covering mechanisms, frames, and foam.

### Sherborne
Premium sofas and recliners renowned for comfort engineering and classic British design. Sherborne combines traditional craftsmanship with modern manufacturing techniques. Their range includes both manual and power recliners with distinctive deep-buttoned upholstery and scroll-arm designs. Sherborne products offer exceptional lumbar support and are particularly popular with customers seeking both comfort and style.

### Florence Collections
Stylish, contemporary furniture with Italian-inspired design at accessible prices. Florence Collections bring European flair to British living rooms with clean lines, slim arms, and metal legs. Their fabric range is particularly extensive with over 100 options. A great choice for modern homes and first-time buyers.

### Cotswold Chair Company
Traditional British chair-making at its finest. Specialising in accent chairs, fireside chairs, and occasional furniture. Each piece reflects generations of chair-making tradition with hand-turned legs, deep-buttoned backs, and premium fabrics. Perfect for period properties and those who appreciate traditional craftsmanship.

### Navinzi
Modern, on-trend furniture designs with a focus on clean lines and urban living. Navinzi pieces are designed for contemporary spaces — apartments, lofts, and modern homes. Expect minimalist styling, slim profiles, and innovative fabric choices. Popular with younger customers furnishing their first home.

### New Trend Concepts Divani
Cutting-edge European design with Italian flair. Statement pieces for design-conscious homes. These are the conversation-starters — bold colours, unusual shapes, and premium materials. Not for the faint-hearted, but perfect for those who want their furniture to make an impression.

### Ashwood Designs
Quality upholstery combining traditional craftsmanship with modern comfort. Ashwood offers a broad range covering classic and contemporary styles. Good mid-range pricing with solid build quality. A versatile brand that works well across different room styles.

## Special Offers & Services

### Clearance
End-of-line and ex-display furniture at significantly reduced prices. Stock changes weekly — visit the showroom to see what's available. Savings of 30-50% off original prices are common. All clearance items are checked for quality before sale.

### Package Deals
Save when you furnish a whole room. Our package deals bundle sofas, chairs, footstools, and occasional tables at special prices. Tell us which room you're furnishing and we'll build a package for you.

### Express Delivery
Fast-track delivery available on selected items. Perfect for when you need furniture quickly — moving home, unexpected guests, or just can't wait to enjoy your new sofa. Delivery timeframes as short as 3-5 working days on express items.

### Best Sellers
Our most popular sofas and chairs, tried and tested by customers across Kent and beyond. These are the pieces that consistently receive the best feedback for comfort, style, and value. A great place to start if you're unsure what to choose.

### Voucher Codes
Seasonal promotions and discount codes available throughout the year. Check our website or sign up for alerts. We regularly offer discounts during bank holidays, Black Friday, January sales, and summer promotions.

## Finance Options

### Interest Free Credit
Spread the cost of your furniture with 0% APR representative. Finance is subject to status and affordability. Minimum spend and deposit requirements apply. Terms and conditions available in-store and on our website.

### Novuna Personal Finance
Our primary finance provider. Novuna is a trading style of Mitsubishi HC Capital UK PLC, authorised and regulated by the FCA (Register no. 704348). They offer a range of finance options including interest-free and interest-bearing plans tailored to your circumstances.

### Snap Finance
Available for customers who may not qualify for prime lending. Snap Finance Ltd offers interest-bearing credit at Representative 29.9% APR. Snap Finance Ltd is a company registered in England and Wales (Registered Number 08080202). Registered address: 1 Vincent Avenue, Crownhill, Milton Keynes MK8 0AB. Customers will only be offered Snap Finance at the discretion of Suite-World.co.uk Limited.

## Delivery Information
We deliver across Kent and throughout the UK. Our delivery service includes:
- Two-person delivery team (not courier drop-off)
- Room of choice placement
- Packaging removal available
- Delivery timeframes typically 2-6 weeks depending on manufacturer
- Express delivery available on selected items (3-5 working days)
- Free local delivery within 20 miles of Dover on orders over £499

## Returns Policy
- 14-day return window from delivery
- Items must be in original condition
- Return delivery charges may apply
- Bespoke or made-to-order items are non-returnable
- Faulty items covered by manufacturer warranty

## Care & Maintenance
- **Leather:** Clean with a damp cloth, condition every 6 months with leather care cream. Keep away from direct sunlight and radiators.
- **Fabric:** Vacuum regularly with upholstery attachment. Treat spills immediately. Professional cleaning recommended annually.
- **Recliner mechanisms:** Lubricate annually. Check bolts and fixings every 6 months.
- **Sofa beds:** Operate the mechanism gently. Rotate the mattress every 3 months.
- We sell leather care kits and fabric protection products in-store.

## Contact & Visit
- **Showroom:** 9-11 London Road, Dover, Kent, CT17 0ST
- **Phone:** 01304 242422
- **Website:** https://suite-world.co.uk
- **Email:** sales@suite-world.co.uk
- **Opening Hours:** Monday-Saturday 9am-5:30pm, Sunday 10am-4pm
- Easy access from the A2 and A20. Plenty of free customer parking.
"""

print("Ingesting catalog...")
post_json(f"/v1/contexts/{ctx_id}/ingest", {
    "text": catalog_text,
    "filename": "catalog.md"
})
print("  Catalog ingested")

# Link context to agent
print("Linking knowledge base to agent...")
update_data = json.dumps({"context_ids": [ctx_id]}).encode('utf-8')
req = urllib.request.Request(
    f"{BASE_URL}/v1/agents/{AGENT_ID}",
    data=update_data,
    headers={'Content-Type': 'application/json'},
    method='PUT'
)
resp = urllib.request.urlopen(req)
print(f"  Agent updated: {json.loads(resp.read())['name']}")

print("\nDone! Knowledge base created and linked.")
