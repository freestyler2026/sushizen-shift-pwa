/**
 * Which city the Store Operation Management Channel is about.
 *
 * Dubai does not use the BO Dashboard. The page opens on Manila, but the
 * sidebar badge was counting the signed-in user's own city, so an HQ account
 * registered to Dubai saw "79" on the menu and then 11 / 22 / 41 / 204 on the
 * page. Neither number was wrong; they were answering different questions, and
 * nothing on either screen said which.
 *
 * Both read this. If the channel is ever rolled out to Dubai, change it here
 * and the badge and the page move together -- three hand-copied city lists is
 * how the shift-edit permissions ended up disagreeing with each other.
 */
export const MANAGEMENT_CHANNEL_CITY = "manila";
