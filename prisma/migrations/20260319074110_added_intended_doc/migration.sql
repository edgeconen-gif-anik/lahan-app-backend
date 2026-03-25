/*
  Warnings:

  - You are about to drop the column `endDate` on the `Contract` table. All the data in the column will be lost.
  - Added the required column `intendedCompletionDate` to the `Contract` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Contract" DROP COLUMN "endDate",
ADD COLUMN     "actualCompletionDate" TIMESTAMP(3),
ADD COLUMN     "intendedCompletionDate" TIMESTAMP(3) NOT NULL;
