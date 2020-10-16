import {Octokit, RestEndpointMethodTypes} from '@octokit/rest'
import moment from 'moment'

import {CommitInfo} from './commits'
import * as core from '@actions/core'

export interface PullRequestInfo {
  number: number
  title: string
  htmlURL: string
  mergedAt: moment.Moment
  author: string
  repoName: string
  labels: string[]
  body: string
}

export class PullRequests {
  constructor(private octokit: Octokit) {}

  async getSingle(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequestInfo | null> {
    try {
      const pr = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber
      })

      return {
        number: pr.data.number,
        title: pr.data.title,
        htmlURL: pr.data.html_url,
        mergedAt: moment(pr.data.merged_at),
        author: pr.data.user.login,
        repoName: pr.data.base.repo.full_name,
        labels: pr.data.labels.map(function (label) {
          return label.name
        }),
        body: pr.data.body
      }
    } catch (e) {
      core.warning(`Cannot find PR ${owner}/${repo}#${prNumber} - ${e.message}`)
      return null
    }
  }

  async getBetweenDates(
    owner: string,
    repo: string,
    fromDate: moment.Moment,
    toDate: moment.Moment, // eslint-disable-line @typescript-eslint/no-unused-vars
    maxPullRequests: number
  ): Promise<PullRequestInfo[]> {
    const mergedPRs: PullRequestInfo[] = []
    const options = this.octokit.pulls.list.endpoint.merge({
      owner,
      repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc'
    })

    for await (const response of this.octokit.paginate.iterator(options)) {
      type PullsListData = RestEndpointMethodTypes['pulls']['list']['response']['data']
      const prs: PullsListData = response.data as PullsListData

      for (const pr of prs.filter(p => !!p.merged_at)) {
        mergedPRs.push({
          number: pr.number,
          title: pr.title,
          htmlURL: pr.html_url,
          mergedAt: moment(pr.merged_at),
          author: pr.user.login,
          repoName: pr.base.repo.full_name,
          labels: pr.labels.map(function (label) {
            return label.name
          }),
          body: pr.body
        })
      }

      const firstPR = prs[0]
      if (firstPR.merged_at && fromDate.isAfter(moment(firstPR.merged_at)) || mergedPRs.length >= maxPullRequests) {
        if( mergedPRs.length >= maxPullRequests ) {
          core.info(`Reached 'maxPullRequests' count ${maxPullRequests}`)
        }
      
        // bail out early to not keep iterating on PRs super old
        return sortPullRequests(mergedPRs, true)
      }
    }

    return sortPullRequests(mergedPRs, true)
  }

  filterCommits(commits: CommitInfo[], excludeMergeBranches: string[]): CommitInfo[] {
    const prRegex = /Merge pull request #(\d+)/
    const filteredCommits = []

    for (const commit of commits) {
      if(excludeMergeBranches) {
        let matched = false
        for (const excludeMergeBranch of excludeMergeBranches) {
          if(commit.summary.includes(excludeMergeBranch)) {
            matched = true
            break
          }
        }
        if(matched) {
          continue
        }
      }

      const match = commit.summary.match(prRegex)
      if (!match) {
        continue
      }
      commit.prNumber = Number.parseInt(match[1], 10)
      filteredCommits.push(commit)
    }

    return filteredCommits
  }
}

export function sortPullRequests(
  pullRequests: PullRequestInfo[],
  ascending: Boolean
): PullRequestInfo[] {
  if (ascending) {
    pullRequests.sort((a, b) => {
      if (a.mergedAt.isBefore(b.mergedAt)) {
        return -1
      } else if (b.mergedAt.isBefore(a.mergedAt)) {
        return 1
      }
      return 0
    })
  } else {
    pullRequests.sort((b, a) => {
      if (a.mergedAt.isBefore(b.mergedAt)) {
        return -1
      } else if (b.mergedAt.isBefore(a.mergedAt)) {
        return 1
      }
      return 0
    })
  }
  return pullRequests
}
