---
title: Using the R tabs
description: Find your way through Now, Activity, Insights and Car, enter a charge cost, and use Settings.
---

# Using the R tabs

R is the interface for this fork. It has four tabs: **Now**, **Activity**,
**Insights** and **Car**. On a phone the tabs are in a dock at the bottom of the
screen. On a wider screen they are in a rail on the left.

Settings is at the bottom of the left rail on a wide screen. On a phone, select
the gear button at the top of a page. Select the sun or moon button to switch
between light and dark. R saves the choice to your account.

When your phone or computer is offline, a banner says so and R shows the last
data it loaded. When R loses the Rivian connection, a red banner says "Rivian
connection lost." Select **Reconnect** and sign in to Rivian again. After you
reconnect, R recovers the missed charges from Rivian.

### Settings

Settings has five parts:

- **Account**: change your password, sign out other devices, or sign out.
- **Sign-in methods**: password and single sign-on (SSO). One method always stays
  on. Turn off password sign-in only after SSO is set up, tested and linked to
  your account.
- **Rivian account**: the connection state, **Reconnect**, and **Recover now**
  for missed charges.
- **Charging rates**: the Home and Office price in $ per kWh. Office 0 means free.
- **Backups**: the last backup. Open it to see the schedule and restore.

## Now

Now answers "is my car OK". It shows, from the top:

1. A status title, and one line of status chips: lock, plug and charge schedule.
2. Your car. Drag the car, or use the arrow keys, to turn it through your own
   Rivian images. Press Home to go back to the side view.
3. Battery % and Range, with the charge limit. When there is enough history,
   a line tells you how many days of your usual driving the range is enough for.
4. The odometer, with this week's miles and drives and a bar for each of the
   last 7 days.
5. **Needs a look**, only when something needs your attention.
6. The latest drive, charge and park.

Now has no charts. The charts are in Insights.

## Activity

Activity opens the trips list. Select a row (or a card on a phone) to open the
trip. Use the checkbox at the start of a row to select a trip for the map or
for tags.

A trip opens with its map first. Tap or drag on the map, the replay scrubber or
a chart to select a point of the drive. The other views show the same point.
Select **Play** to replay the drive in 10 seconds. Use **Pan map** to move the
map, then **Inspect route** to select points again.

## Insights

Insights is a list of analysis pages:

- **Cost**: charges, energy added and what they cost.
- **Battery**: battery health, level and range.
- **Parked loss**: the battery that the car loses while it is parked.
- **Efficiency**: mi/kWh trends, temperature and trip comparisons.
- **Custom dashboards**: your saved layouts and views.

### Custom dashboards

Select **Insights → Custom dashboards** to open the dashboard library. Your
saved dashboards are there, with Open, Edit and Export. Dashboards that you
saved before this release still work and keep their layout.

## Car

Car opens Vehicle health. It starts with four status tiles: data connection,
12 V battery, Battery thermal and Software. Tires, doors and locks, diagnostics,
signal details and software history follow. When a drive has telemetry but no
trip, a **Possible missed drive** card shows at the top; see
[Recover a missed drive](./extended-vehicle-telemetry.md#recover-a-missed-drive).

### Settings and Sign out

The **Settings** row is at the bottom of the Car tab. Settings is a searchable
directory of vehicle, place, charging, dashboard, chart, unit, API and data
settings. Your role controls which settings you can see.

To sign out, open **Settings → Account** and select **Sign out**.

## Enter the cost of a charge

When Rivian sends no price for a charge, the charge page asks for it.

1. Open the charge from **Insights → Cost**, then select the charge in the
   list.
2. In **Add the cost of this charge**, select **Total paid** or
   **Rate per kWh**.
3. Enter the total from your receipt, or the rate. The line below the field
   shows the result, for example "= 50¢ per kWh for 28.6 kWh".
4. Optional: with a rate, select the rate option.
   - With no saved place at the charger, the option is **Use this rate for my
     next charges at this charger**. The app adds a saved place at that charger
     with the rate. Automatic charges at this place then use this rate.
   - With a saved place at the charger, the option is **Use this rate at**
     *place*. This changes the price of the place. Past automatic charges at
     the place are priced again with this rate. Before the save, a confirm step
     says this. Select **Save and change** *place* to continue, or **Cancel**.
   - The cost box does not change the Home place or a place with time-of-use
     rates. Change the Home price in **Settings → Charging rates**.
5. Select **Save cost**.

You can enter a decimal with a period or one comma ("14.30" or "14,30"). Do
not use a comma for thousands.

If the cost saves and the place rate does not, the box stays open and says so.
Select **Try again**, or **Close** to keep only the cost.

To change a saved price, select **Edit** on the charge page. Edit also has
**Mark free** and, for a price that you entered, **Use the automatic price**.

Each price names its method: Billed by Rivian, Your home rate, Place rate,
Your price, Free, No price or Price pending.

### Set the Home and Office price

1. Open **Settings → Charging rates**.
2. Enter the Home and Office price in $ per kWh. Enter 0 when charging is free.
3. Select **Save rates**.

Charges at that place then use its rate. A public DC charge never uses your
home rate.
