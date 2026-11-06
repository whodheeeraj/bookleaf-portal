# BookLeaf Publishing - Author Royalty Dashboard & Notification System
[By Dheeraj Sain](https://whodheeeraj.github.io/)

## 1. Project Overview

This project is an author royalty management application built with
**Bubble.io** and **n8n**.

It provides two main areas:

-   **Author portal:** Authors can log in and view their books, sales
    information, royalty figures, and consolidated royalty totals.
-   **Admin portal:** Administrators can view author records, search and
    filter the author list, inspect an author's details, and trigger an
    AI-generated royalty summary.

n8n is used as the automation layer. Bubble sends an author's royalty
information to an n8n webhook. The workflow prepares the information,
sends it to an AI model to generate a readable summary, and stores the
generated result for verification.

The application uses the sample BookLeaf dataset supplied with the
technical assignment.

## 2. Technology Stack

  Component                        Technology
  -------------------------------- -----------------------------------------------------
  Application and user interface   Bubble.io
  Database                         Bubble database
  Workflow automation              n8n
  Workflow trigger                 n8n Webhook
  AI processing                    n8n Basic LLM Chain with NVIDIA Nemotron Chat Model
  Automation result storage        n8n Data Tables
  Integration                      Bubble API Connector and webhook requests

## 3. Application Structure

### 3.1 Author Portal

An authenticated author can view their own dashboard. The current
dashboard includes:

-   A personalised welcome message.
-   Total royalty earned, paid, and pending across the author's books.
-   A list of the author's books.
-   Book title, MRP, ISBN, genre, and platform availability.
-   Total copies sold.
-   Royalty earned, paid, and pending for each book.
-   Last royalty payout date.

The dashboard uses the logged-in user's author profile to retrieve the
related author and book information.

### 3.2 Admin Portal

The admin dashboard provides an overview of the authors in the
application. The current interface includes:

-   Author name and total number of books.
-   Total royalty earned and pending.
-   Payout status.
-   Search by author name.
-   City and payout-status filters.
-   An action to open an author's details.
-   A bulk royalty-summary trigger.

The author detail view displays the selected author's books and royalty
information. The individual **Generate & Send Royalty Summary** action
starts the n8n automation for that author.

### 3.3 Authentication and Privacy

The application uses Bubble user authentication.

Privacy rules have been configured so that an author can access only
their own author-related records, while an administrator can access the
records required for administration. These rules should be tested using
separate author and admin accounts before submission. Confirm that an
author cannot access another author's records by changing a page URL or
data reference.

## 4. Database Design

The application separates user login information, author information, book information, and notification records.

| Data Type | Purpose |
| --- | --- |
| User | Stores login identity and role information, including the link to an author profile where applicable. |
| Author | Stores author details such as author ID, name, email, city, phone, joining date, and payout information. |
| Book | Stores book details and its relationship to the relevant author, including title, ISBN, genre, MRP, publication/status information, platform availability, sales, and royalty figures. |
| NotificationLog | Stores royalty-summary notification information, including the author, notification identifier, status, and generated summary content. |

### Relationships

-   A User can be linked to an Author profile.
-   An Author can have multiple Books.
-   Each Book is linked to its relevant Author.
-   A NotificationLog record is associated with the author for whom the
    summary was generated.

The application uses these relationships to retrieve an author's books
and calculate consolidated royalty totals.

**Note:** This is the logical structure. Check the Bubble Data types tab
and update any field names or types here if they differ from the actual
database.

## 5. Bubble-to-n8n Integration

The integration is initiated from a Bubble workflow.

### Individual trigger

1.  An administrator opens an author's details.
2.  The administrator clicks **Generate & Send Royalty Summary**.
3.  Bubble creates a NotificationLog record.
4.  Bubble calls the configured n8n webhook through the API Connector.
5.  The request contains the author's information, royalty totals, book
    information, and the NotificationLog identifier.

### Bulk trigger

The admin dashboard also provides a bulk trigger. The intended behaviour
is to call the same n8n webhook for each eligible author with pending
royalties. Test the bulk workflow to confirm that it processes each
eligible author separately and does not send duplicate requests.

### Webhook Payload

The Bubble API request uses the following fields:

| Field | Description |
| --- | --- |
| `author_id` | Author's identifier. |
| `notification_log_id` | Identifier of the Bubble NotificationLog record. |
| `author_name` | Author's name. |
| `author_email` | Author's email address. |
| `total_earned` | Consolidated royalty earned. |
| `total_paid` | Consolidated royalty paid. |
| `total_pending` | Consolidated royalty pending. |
| `books` | Book information for the author. |

Bubble calculates the royalty totals and retrieves the related books
before sending the request. This keeps the initial integration
straightforward and avoids requiring n8n to query multiple Bubble data
types for the first version.

## 6. n8n Workflow

The main workflow is named `bookleaf-rd`.

The workflow follows this sequence:

1.  **Webhook:** Receives the request from Bubble.
2.  **Code in JavaScript:** Reads the incoming payload and prepares the
    author, royalty, and book information.
3.  **Basic LLM Chain:** Sends the prepared context to the configured AI
    model.
4.  **Code in JavaScript:** Extracts the AI response and prepares the
    final output.
5.  **Data Table -- Insert Row:** Stores the generated royalty summary
    and related details in the `royalty_summaries` table.

### Data preparation

The first JavaScript node reads the incoming request body, extracts the
author name, email, author ID, and NotificationLog ID, converts royalty
values to numbers, reads the books array, and prepares a text context
containing the author details, consolidated royalty totals, and book
information.

### AI prompt approach

The AI is instructed to generate a professional royalty-summary email
based strictly on the information supplied by Bubble.

The generated summary is intended to include:

-   A personalised greeting.
-   The author's royalty overview.
-   Total earned, total paid, and total pending.
-   Book-level information supplied in the request.
-   An explanation of pending payouts based on the applicable quarterly
    payout policy.
-   A professional closing consistent with BookLeaf's communication
    style.

The model should not invent sales, payment dates, royalty amounts, or
publication details. If information is missing, the summary should avoid
making unsupported claims.

### Output preparation

The second JavaScript node extracts the generated text and prepares
fields such as `notification_log_id`, `status`, `summary_content`, and
`error_message`.

The output is then stored in the n8n Data Table named
`royalty_summaries`. This provides a way to inspect and demonstrate the
generated result even when the Bubble callback is not available.

## 7. Royalty Calculation and Data Handling

The consolidated figures displayed on the author dashboard are
calculated from the author's related books:

-   Total earned: sum of the books' `total_royalty_earned` values.
-   Total paid: sum of the books' `royalty_paid` values.
-   Total pending: sum of the books' `royalty_pending` values.

The figures should be checked against the source dataset and individual
book records.

The AI workflow receives the totals from Bubble. It should not
independently recalculate or change the supplied financial values.

## 8. Error Handling and Security

The following items must be verified before the application is treated
as production-ready.

### Webhook authentication

The n8n webhook should not accept unauthenticated requests. The
recommended configuration is Header Auth in the n8n Webhook node, using
a private shared secret. Bubble should send the matching header from its
server-side API Connector call.

The secret must not be displayed in page elements, browser-side
JavaScript, screenshots, or public documentation.

Test the webhook with: - A valid request containing the correct
header. - A request without the header. - A request containing an
incorrect secret.

The invalid requests should be rejected.

**Status:** Confirm the Header Auth credential and Bubble header are
configured and tested before marking this item complete.

### Workflow failure handling

The workflow should handle failures from the AI provider, JavaScript
processing, and external requests.

A separate n8n error workflow can use an Error Trigger and write failed
execution details to an error log table. Useful fields include workflow
name, execution ID, failed node, error message, failure time, and
status.

**Status:** Configure the error workflow and connect it in the main
workflow settings. Test it before marking this item complete.

### Bubble callback

The assignment requires the generated summary and final Success or
Failed status to be sent back to Bubble and reflected in the
NotificationLog.

The current working test path stores the generated summary in the n8n
`royalty_summaries` Data Table. The Bubble callback previously returned
an authorization error (HTTP 401), so the callback should be treated as
a remaining integration task until it is successfully tested.

The final implementation should update the existing NotificationLog
record using its `notification_log_id`, rather than creating an
unrelated record.

### Duplicate requests

The application should prevent accidental repeated triggers for the same
author. A practical approach is to disable the trigger while a request
is being processed or check for a recent in-progress notification before
starting another execution.

## 9. Testing

Complete and record the following test cases before submission.

| Test Case | Expected Result |
| --- | --- |
| Author logs in | Author dashboard opens. |
| Author views their books | Only books linked to that author are displayed. |
| Author views royalty totals | Totals match the related book records. |
| Author attempts to access another author's data | Access is denied. |
| Admin logs in | Admin dashboard displays the author overview. |
| Admin searches for an author | Matching author records are displayed. |
| Admin filters by city or payout status | Results match the selected filter. |
| Admin triggers an individual summary | Bubble sends a request to n8n. |
| n8n receives a valid request | Workflow starts and processes the payload. |
| AI generates a summary | Generated text is available in the workflow output. |
| n8n stores the summary | A row is created in `royalty_summaries`. |
| Invalid webhook authentication | Request is rejected. |
| AI or workflow node fails | Failure is logged and the notification is marked Failed once callback handling is complete. |
| Bulk trigger is used | Each eligible author is processed separately without unintended duplicates. |

## 10. Challenges and Learning

Bubble.io was a new platform during this assignment, so an important
part of the work was understanding its database relationships, dynamic
expressions, privacy rules, and workflow actions.

One of the main integration challenges was mapping Bubble data correctly
into the n8n webhook request.

The book information initially did not reach the later n8n nodes in the
expected format. The payload was inspected at the webhook, and the
JavaScript processing was adjusted to preserve the incoming books array
and prepare the data for the AI step.

Another challenge was the Bubble API authorization error when attempting
to update the NotificationLog from n8n. To keep the AI workflow
testable, the generated summary was stored in an n8n Data Table. The
Bubble callback remains a separate item to verify and complete.

This work provided practical experience connecting a no-code application
to an automation platform and an AI model to build an end-to-end
business workflow.

## 11. Project Links and Access


-   **Bubble application URL:** [BookLeaf Publishing Portal](https://drj8work.bubbleapps.io/version-test/)
-   **Test author account:** 
    - Username : `dheeraj.sain@email.com`
    - Password : `PDb3@+0c`
-   **Test admin account:** 
    - Username : `dheeraj.sain@email.com`
    - Password : `x5GnK}}7`
-   **n8n Workflow:**
    <img width="797" height="359" alt="n8nwf" src="https://github.com/user-attachments/assets/8b0a389a-bc81-4804-a772-92e6da5fffbd" />
    


------------------------------------------------------------------------

**Project:** BookLeaf Publishing -- Author Royalty Dashboard & Automated
Notification System\
**Platform:** Bubble.io + n8n + AI API\
**Document:** Technical Assignment 2 -- Implementation README
